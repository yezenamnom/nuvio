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

const storeVer = {}; // نسخة كل مفتاح: بتزيد مع كل تغيير
const store = {
  // قيمة فاضية (null) = متل ما في شي → منرجّع الافتراضي (كانت تكسّر الصفحات بعد المزامنة)
  get(k, d) { try { const v = localStorage.getItem('nuvio:' + k); if (v == null) return d; const x = JSON.parse(v); return x == null ? d : x; } catch { return d; } },
  set(k, v) {
    try { localStorage.setItem('nuvio:' + k, JSON.stringify(v)); } catch { /* ignore */ }
    storeVer[k] = (storeVer[k] || 0) + 1;
    window.dispatchEvent(new CustomEvent('nuvio:store', { detail: k }));
  },
};
// تغيير من تبويب تاني بنفس المتصفح
window.addEventListener('storage', e => {
  if (!e.key || !e.key.startsWith('nuvio:')) return;
  const k = e.key.slice(6); storeVer[k] = (storeVer[k] || 0) + 1;
  window.dispatchEvent(new CustomEvent('nuvio:store', { detail: k }));
});

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

async function fetchJSON(url, ms = 9000, fresh = false) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    // fresh = منتخطّى التخزين (للفحص لحتى نعرف إذا السيرفر عايش فعلاً)
    const r = await fetch(url, { signal: ctl.signal, referrerPolicy: 'no-referrer', cache: fresh ? 'no-store' : 'default' });
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
      ? await fetchJSON(`${inst.url}/streams/${PROBE_VIDEO}`, 8000, true)
      : await fetchJSON(`${inst.url}/api/v1/videos/${PROBE_VIDEO}`, 8000, true);
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
async function withFallback(op, opts = {}) {
  if (!opts.yti || !ytiUsable()) return withFallbackPublic(op, opts);
  const p = op(YTI_INST).then(res => ({ inst: YTI_INST, res }));
  // منعطي يوتيوب المباشر شوية وقت؛ إذا ما جاوب منبلّش بالسيرفرات العامة بنفس الوقت، وأول واحد بيربح
  const first = await Promise.race([p.then(x => ({ x }), e => ({ e })), sleep(1500).then(() => null)]);
  if (first && first.x) return first.x;
  if (first && first.e) return withFallbackPublic(op, opts);
  return new Promise((resolve, reject) => {
    let fails = 0;
    const fail = e => { if (++fails === 2) reject(e); };
    p.then(resolve, fail);
    withFallbackPublic(op, opts).then(resolve, fail);
  });
}
async function withFallbackPublic(op, { skip = [], stagger = 2000, prefer = null } = {}) {
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
/* ---- مباشرة من غوغل/يوتيوب (بلا سيرفر وسيط): اقتراحات البحث وعنوان الفيديو ---- */
let jsonpN = 0;
function jsonp(url, ms = 2500) {
  return new Promise((ok, bad) => {
    const cb = '__nv' + (++jsonpN) + Date.now().toString(36);
    const sc = document.createElement('script');
    let t = 0;
    const done = () => { clearTimeout(t); sc.remove(); };
    window[cb] = d => { done(); delete window[cb]; ok(d); };
    t = setTimeout(() => { done(); window[cb] = () => { delete window[cb]; }; bad(new Error('بطيء')); }, ms);
    sc.onerror = () => { done(); delete window[cb]; bad(new Error('ما وصل')); };
    sc.referrerPolicy = 'no-referrer';
    sc.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    document.head.append(sc);
  });
}
function googleSuggest(q) {
  const hl = /[\u0600-\u06FF]/.test(q) ? 'ar' : (navigator.language || 'en').slice(0, 2);
  return jsonp(`https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&hl=${hl}&q=${encodeURIComponent(q)}`)
    .then(d => {
      const l = ((d && d[1]) || []).map(x => (Array.isArray(x) ? x[0] : x)).filter(s => typeof s === 'string' && s.trim());
      if (!l.length) throw new Error('فاضي');
      return l;
    });
}
function ytOembed(id) {
  return cached('oe:' + id, 24 * 3600e3, () => fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`, { referrerPolicy: 'no-referrer' })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(d => ({ title: d.title || '', author: d.author_name || '' })));
}

function cached(key, ttl, fn) {
  const e = memo.get(key);
  if (e && Date.now() - e.at < ttl) return e.p;
  const p = fn();
  memo.set(key, { at: Date.now(), p });
  p.catch(() => memo.delete(key));
  return p;
}
const getVideo = id => cached('v:' + id, 20 * 60e3, () => withFallback(i => apiFor(i).video(i.url, id), { prefer: 'invidious' }));
const getChannel = id => cached('c:' + id, 10 * 60e3, () => withFallback(i => apiFor(i).channel(i.url, id), { yti: true }));

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
  pickThumb(base, arr, id) { return ytThumb(id); },
  pickAvatar(base, arr) {
    const a = (arr || []).filter(x => x.width >= 88).sort((x, y) => x.width - y.width)[0] || (arr || []).slice(-1)[0];
    return a ? abs(base, a.url) : '';
  },
  item(base, v) {
    return {
      id: v.videoId, title: v.title, author: v.author, authorId: v.authorId,
      duration: v.lengthSeconds, views: v.viewCount != null ? v.viewCount : null, viewsText: v.viewCountText,
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
  async channels(base, q, max = 3) {
    const d = await fetchJSON(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=channel&page=1`);
    return (Array.isArray(d) ? d : []).filter(c => c.type === 'channel').slice(0, max).map(c => ({
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
  idOf: url => ((url || '').split('v=')[1] || '').split('&')[0] || '',
  item(v) {
    const id = Piped.idOf(v.url);
    return {
      id, title: v.title, author: v.uploaderName, authorId: (v.uploaderUrl || '').split('/channel/')[1] || '', duration: v.duration, views: v.views != null ? v.views : null,
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
      avatar: d.uploaderAvatar || '', subs: d.uploaderSubscriberCount > 0 ? `${nf.format(d.uploaderSubscriberCount)} مشترك` : '', views: d.views, published: (d.uploadDate || '').slice(0, 10) || '',
      likes: d.likes, description: txt || '', audio: aud ? aud.url : '',
      related: (d.relatedStreams || []).filter(v => v.type === 'stream').map(Piped.item),
      sources,
    };
  },
};
/* ================= يوتيوب مباشرة (عبر وسيطنا الصغير على tube.glanzstar.de) =================
   البحث والقنوات والمشابه من يوتيوب نفسو: أسرع وأثبت من السيرفرات العامة.
   الوسيط ما بيحفظ شي وما بيبعت IP تبعك ليوتيوب. إذا ما جاوب، منرجع للسيرفرات العامة متل قبل. */
const YTI = 'https://tube.glanzstar.de/yti/youtubei/v1/';
const YTI_INST = { url: YTI, type: 'yti' };
const YTI_CLIENT = { clientName: 'WEB', clientVersion: '2.20251118.01.00', hl: 'ar', gl: 'DE' };
let ytiDown = 0;
// إضافة «Nuvio Direct» (شوف تحت «من جهازك»): إذا موجودة، كل طلبات يوتيوب بتروح من جهازك ليوتيوب مباشرة، ولا شي عبر سيرفرنا
const extOn = () => document.documentElement.hasAttribute('data-nuvio-ext');
let extDown = 0; // الإضافة موجودة بس الطلب ما وصل (إذن ناقص؟): منرتاح منها دقيقتين
const extUsable = () => extOn() && Date.now() - extDown > 2 * 60e3;
const ytiUsable = () => extUsable() || Date.now() - ytiDown > 120e3; // إذا فشل، منرتاح منو دقيقتين
/* ---- ردود يوتيوب بتنحفظ على الجهاز (مضغوطة) ----
   لمّا تسكّر الموقع وترجع: البحث والقنوات وصفحات الفيديو بتبيّن فوراً من التخزين،
   وإذا صارت قديمة منحدّثها بالخلفية (للمرة الجاية). بلا نت؟ منعرض آخر شي محفوظ. */
const YC = 'nuvio-yti-v1', YC_FRESH = 20 * 60e3, YC_MAX = 3 * 86400e3, YC_LIMIT = 300;
const YC_GZ = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
let ytiBypass = 0; // فحص الفيديوهات الجديدة بالقنوات: بدو الجديد بس
let ycStore = null;
const ycOpen = () => (ycStore = ycStore || (self.caches ? caches.open(YC) : Promise.reject(new Error('no caches'))));
function ycHash(s) { // cyrb53
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const ycKey = (ep, body) => `https://nuvio.cache/yti/${ep}?k=${ycHash(JSON.stringify(body))}`;
async function ycGet(key) {
  try {
    const r = await (await ycOpen()).match(key);
    if (!r) return null;
    const at = +r.headers.get('x-at') || 0;
    const s = r.headers.get('x-gz') === '1' ? r.body.pipeThrough(new DecompressionStream('gzip')) : r.body;
    return { at, data: await new Response(s).json() };
  } catch { return null; }
}
let ycTrimT = 0;
async function ycPut(key, data) {
  try {
    const c = await ycOpen();
    let blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    if (YC_GZ) blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
    await c.put(key, new Response(blob, { headers: { 'x-at': String(Date.now()), 'x-gz': YC_GZ ? '1' : '0' } }));
    clearTimeout(ycTrimT);
    ycTrimT = setTimeout(async () => { try { const ks = await c.keys(); for (let i = 0; i < ks.length - YC_LIMIT; i++) await c.delete(ks[i]); } catch { /* */ } }, 4000);
  } catch { /* التخزين مليان أو مش مدعوم: عادي */ }
}
async function yti(ep, body, ms = 6000) {
  const key = ycKey(ep, body);
  const hit = await ycGet(key);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && !ytiBypass && age < YC_FRESH) return hit.data;
  if (hit && !ytiBypass && age < YC_MAX) { // قديم شوي: منعرضو هلّق ومنحدّثو بالخلفية
    ytiNet(ep, body, ms).then(d => ycPut(key, d)).catch(() => {});
    return hit.data;
  }
  try {
    const d = await ytiNet(ep, body, ms);
    ycPut(key, d);
    return d;
  } catch (e) { if (hit) return hit.data; throw e; } // بلا نت: آخر شي محفوظ
}
async function ytiNet(ep, body, ms = 6000) {
  // مع الإضافة: من جهازك ليوتيوب مباشرة (بلا وسيطنا أبداً). إذا فشل، withFallback بيروح للسيرفرات العامة
  if (extUsable()) return ytDirect(ep, { context: { client: YTI_CLIENT }, ...body }, ms);
  if (!ytiUsable()) throw new Error('الوسيط مرتاح');
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(YTI + ep, {
      method: 'POST', signal: ctl.signal, referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, // طلب بسيط: بلا طلب استئذان إضافي
      body: JSON.stringify({ context: { client: YTI_CLIENT }, ...body }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) { ytiDown = Date.now(); throw e; } finally { clearTimeout(tm); }
}
function walk(o, key, out = []) {
  if (Array.isArray(o)) { for (const x of o) walk(x, key, out); }
  else if (o && typeof o === 'object') {
    for (const k in o) { const v = o[k]; if (k === key) out.push(v); else if (v && typeof v === 'object') walk(v, key, out); }
  }
  return out;
}
const ytTxt = o => (!o ? '' : typeof o === 'string' ? o : o.simpleText || o.content || (o.runs || []).map(r => r.text).join(''));
const latinDigits = s => String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٫/g, '.');
function parseCount(s) {
  if (!s) return null;
  s = latinDigits(s).replace(/[,٬\s](?=\d{3}\b)/g, '');
  const m = s.match(/(\d+(?:\.\d+)?)\s*(ألف|آلاف|مليون|ملايين|مليار|K|M|B)?/i);
  if (!m) return /لا توجد|no views/i.test(s) ? 0 : null;
  const mul = { 'ألف': 1e3, 'آلاف': 1e3, 'مليون': 1e6, 'ملايين': 1e6, 'مليار': 1e9, k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1;
  return Math.round(parseFloat(m[1]) * mul);
}
// «قبل شهرين» ← وقت تقريبي (للترتيب والفلترة)
const AGO_UNITS = [[/ثاني|second/i, 1], [/دقيق|دقائق|minute/i, 60], [/ساع|hour/i, 3600], [/يوم|أيام|day/i, 86400],
  [/أسبوع|أسابيع|week/i, 604800], [/شهر|أشهر|شهور|month/i, 2592000], [/سن(ة|وات|تين)|عام|أعوام|year/i, 31536000]];
function agoTs(s) {
  if (!s) return 0;
  s = latinDigits(s);
  const u = AGO_UNITS.find(([re]) => re.test(s)); if (!u) return 0;
  const n0 = s.match(/\d+/);
  const n = n0 ? +n0[0] : /(ين|تين)(\s|$)/.test(s) ? 2 : 1; // شهرين، يومين، ساعتين…
  return Math.floor(Date.now() / 1000) - n * u[1];
}
const durSec = s => { const p = latinDigits(s).trim().split(':').map(Number); return p.length > 1 && p.every(n => !isNaN(n)) ? p.reduce((a, n) => a * 60 + n, 0) : 0; };
const httpsUrl = u => (u && u.startsWith('//') ? 'https:' + u : u || '');
const lastThumb = o => { const l = (o && o.thumbnails) || []; return l.length ? l[l.length - 1].url : ''; };
const uniqById = list => { const s = new Set(); return list.filter(v => v && v.id && !s.has(v.id) && s.add(v.id)); };
function ytContToken(d) {
  // منفتّش بس بالقائمة نفسها (مش بقسم «حول القناة» أو التعليقات)
  const roots = [];
  const sel = walk(d.contents || {}, 'tabRenderer').find(x => x.selected);
  if (sel) roots.push(sel.content);
  const ps = ((d.contents || {}).twoColumnSearchResultsRenderer || {}).primaryContents;
  if (ps) roots.push(ps);
  for (const k of ['onResponseReceivedActions', 'onResponseReceivedCommands']) if (d[k]) roots.push(d[k]);
  const c = walk(roots.length ? roots : d, 'continuationItemRenderer');
  for (let i = c.length - 1; i >= 0; i--) { const tk = (walk(c[i], 'continuationCommand')[0] || {}).token; if (tk) return tk; }
  return null;
}
// فيديو بشكل videoRenderer / compactVideoRenderer (البحث)
function fromVR(v) {
  const by = ((v.longBylineText || v.ownerText || v.shortBylineText || {}).runs || [])[0] || {};
  const live = (v.badges || []).some(b => /LIVE/.test((b.metadataBadgeRenderer || {}).style || ''))
    || (v.thumbnailOverlays || []).some(o => (o.thumbnailOverlayTimeStatusRenderer || {}).style === 'LIVE');
  const vt = ytTxt(v.viewCountText), pt = ytTxt(v.publishedTimeText);
  const av = httpsUrl(lastThumb((((v.channelThumbnailSupportedRenderers || {}).channelThumbnailWithLinkRenderer) || {}).thumbnail));
  return { id: v.videoId, title: ytTxt(v.title), author: by.text || '', authorId: ((by.navigationEndpoint || {}).browseEndpoint || {}).browseId || '', avatar: av,
    duration: live ? 0 : durSec(ytTxt(v.lengthText)), views: parseCount(vt), viewsText: vt, published: pt, ts: agoTs(pt), thumb: ytThumb(v.videoId), live };
}
// فيديو بشكل lockupViewModel (القنوات والمشابه)
function fromLockup(l, ch) {
  if (!l || l.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO' || !l.contentId) return null;
  const md = (l.metadata || {}).lockupMetadataViewModel || {};
  const rows = (((md.metadata || {}).contentMetadataViewModel || {}).metadataRows || [])
    .map(r => (r.metadataParts || []).map(x => ({ t: (x.text || {}).content || '', a: x.accessibilityLabel || '' }))).filter(r => r.length);
  let author = (ch && ch.name) || '', authorId = (ch && ch.id) || '';
  let stat = rows;
  if (!ch) {
    if (rows[0] && rows[0].length === 1 && !/مشاهد|view|يشاهد|watching/i.test(rows[0][0].a + rows[0][0].t)) { author = rows[0][0].t; stat = rows.slice(1); }
    authorId = (walk(md.image || {}, 'browseEndpoint')[0] || walk(md.metadata || {}, 'browseEndpoint')[0] || {}).browseId || '';
  }
  const flat = stat.flat();
  const vp = flat.find(x => /مشاهد|view|يشاهد|watching/i.test(x.a || x.t)) || flat[0];
  const tp = flat.find(x => x !== vp && /قبل|ago|منذ|بث|stream/i.test(x.a || x.t));
  const badges = walk(l.contentImage || {}, 'thumbnailBadgeViewModel');
  const bt = badges.map(b => b.text || '').find(Boolean) || '';
  const live = badges.some(b => /LIVE/.test(b.badgeStyle || '')) || /مباشر|LIVE/i.test(bt);
  const vt = vp ? vp.a || vp.t : '', pt = tp ? tp.t : '';
  const avSrc = ((walk(md.image || {}, 'sources')[0]) || [])[0];
  return { id: l.contentId, title: (md.title || {}).content || '', author, authorId, avatar: (ch && ch.avatar) || (avSrc && httpsUrl(avSrc.url)) || '',
    duration: live ? 0 : durSec(bt), views: parseCount(vt), viewsText: vt, published: pt, ts: agoTs(pt), thumb: ytThumb(l.contentId), live };
}
function fromShort(s, ch) {
  const id = ((((s.onTap || {}).innertubeCommand || {}).reelWatchEndpoint) || {}).videoId || String(s.entityId || '').replace(/^shorts-shelf-item-/, '');
  if (!id) return null;
  const om = s.overlayMetadata || {}, vt = (om.secondaryText || {}).content || '';
  return { id, title: (om.primaryText || {}).content || s.accessibilityText || '', author: (ch && ch.name) || '', authorId: (ch && ch.id) || '',
    duration: 0, views: parseCount(vt), viewsText: vt, published: '', ts: 0, thumb: ytThumb(id), live: false };
}
function fromPlLockup(l) {
  if (!l || l.contentType !== 'LOCKUP_CONTENT_TYPE_PLAYLIST' || !l.contentId) return null;
  const md = (l.metadata || {}).lockupMetadataViewModel || {};
  const src = (walk(l.contentImage || {}, 'sources')[0] || [])[0] || {};
  const bt = walk(l.contentImage || {}, 'thumbnailBadgeViewModel').map(b => b.text).find(Boolean) || '';
  return { id: l.contentId, title: (md.title || {}).content || '', count: parseCount(bt), thumb: src.url || '' };
}
// فلاتر البحث بصيغة يوتيوب (protobuf صغير)
function ytSearchParams(f = {}, type = 1) {
  const sort = { rating: 1, upload_date: 2, view_count: 3 }[f.sort] || 0;
  const flt = [];
  const date = { hour: 1, today: 2, week: 3, month: 4, year: 5 }[f.date]; if (date) flt.push(0x08, date);
  flt.push(0x10, type); // 1 فيديو، 2 قناة
  const dur = { short: 1, long: 2, medium: 3 }[f.dur]; if (dur) flt.push(0x18, dur);
  const feat = { hd: 0x20, subtitles: 0x28, live: 0x40 }[f.feat]; if (feat) flt.push(feat, 1);
  const bytes = (sort ? [0x08, sort] : []).concat([0x12, flt.length], flt);
  return btoa(String.fromCharCode(...bytes));
}
const YT_TABS = { videos: 'EgZ2aWRlb3PyBgQKAjoA', shorts: 'EgZzaG9ydHPyBgUKA5oBAA==', live: 'EgdzdHJlYW1z8gYECgJ6AA==', playlists: 'EglwbGF5bGlzdHPyBgQKAkIA' };
function ytChannelInfo(d, id) {
  const md = (d.metadata || {}).channelMetadataRenderer || {};
  const ph = (((d.header || {}).pageHeaderRenderer || {}).content || {}).pageHeaderViewModel || {};
  const src = l => ((l || [])[(l || []).length - 1] || {}).url || '';
  const parts = walk(ph.metadata || {}, 'metadataParts').flat().map(x => (x.text || {}).content || '');
  return {
    id, name: md.title || ytTxt((((ph.title || {}).dynamicTextViewModel) || {}).text) || '',
    avatar: httpsUrl(lastThumb(md.avatar) || src((walk(ph.image || {}, 'sources')[0]))),
    banner: httpsUrl(src(walk(ph.banner || {}, 'sources')[0])),
    subs: parseCount(parts.find(x => /مشترك|subscriber/i.test(x))), description: md.description || '',
  };
}
function ytTabItems(d, tab, ch) {
  if (tab === 'playlists') return { lists: walk(d, 'lockupViewModel').map(fromPlLockup).filter(Boolean), next: ytContToken(d) };
  const items = tab === 'shorts'
    ? walk(d, 'shortsLockupViewModel').map(s => fromShort(s, ch))
    : walk(d, 'lockupViewModel').map(l => fromLockup(l, ch)).concat(walk(d, 'videoRenderer').map(v => ({ ...fromVR(v), author: ch.name, authorId: ch.id })));
  return { items: uniqById(items), next: ytContToken(d) };
}
const YtApi = {
  async search(base, q, page, cont, f = {}) {
    const d = await yti('search', cont ? { continuation: cont } : { query: q, params: ytSearchParams(f || {}) });
    const items = uniqById(walk(d, 'videoRenderer').map(fromVR));
    if (!cont && !items.length) throw new Error('فاضي');
    return { items, next: items.length ? ytContToken(d) : null };
  },
  async channels(base, q, max = 3) {
    const d = await yti('search', { query: q, params: ytSearchParams({}, 2) });
    return walk(d, 'channelRenderer').slice(0, max).map(c => {
      const st = [ytTxt(c.videoCountText), ytTxt(c.subscriberCountText)].find(x => /مشترك|subscriber/i.test(x));
      const verified = (c.ownerBadges || []).some(b => /VERIFIED/.test((b.metadataBadgeRenderer || {}).style || ''));
      return { id: c.channelId, name: ytTxt(c.title), avatar: httpsUrl(lastThumb(c.thumbnail)), subs: parseCount(st), videos: null, verified };
    });
  },
  async channel(base, id, cont) {
    if (cont) { const d = await yti('browse', { continuation: cont }); const ch = chPreview.get(id) || {}; return ytTabItems(d, 'videos', { id, name: ch.name || '' }); }
    const d = await yti('browse', { browseId: id, params: YT_TABS.videos });
    const info = ytChannelInfo(d, id);
    if (!info.name) throw new Error('قناة مش موجودة');
    const { items, next } = ytTabItems(d, 'videos', info);
    return { info, items, next };
  },
  // تبويب قناة: فيديوهات (الأحدث/الرائجة/الأقدم)، شورتس، مباشر، قوائم
  async tab(id, tab, sort, cont) {
    const ch = { id, name: (chPreview.get(id) || {}).name || '' };
    const mark = o => { if (o.next) o.next = 'yt:' + o.next; return o; }; // منعلّم الصفحة الجاية إنها من يوتيوب المباشر
    if (cont) {
      if (!cont.startsWith('yt:')) throw new Error('صفحة من سيرفر عام');
      return mark(ytTabItems(await yti('browse', { continuation: cont.slice(3) }), tab, ch));
    }
    const d = await yti('browse', { browseId: id, params: YT_TABS[tab] || YT_TABS.videos });
    ch.name = ytChannelInfo(d, id).name || ch.name;
    const k = tab === 'videos' ? { popular: 1, oldest: 2 }[sort] : 0;
    if (k) {
      const chip = walk(d, 'chipViewModel')[k];
      const tk = chip && (walk(chip, 'continuationCommand')[0] || {}).token;
      if (!tk) throw new Error('ما في ترتيب');
      return mark(ytTabItems(await yti('browse', { continuation: tk }), tab, ch));
    }
    // القناة ما فيها هالتبويب؟ يوتيوب بيرجّع تبويب تاني — منقول «ما في شي» بدل ما نعرض غلط
    const sel = walk(d, 'tabRenderer').find(x => x.selected);
    const selUrl = (((((sel || {}).endpoint || {}).commandMetadata || {}).webCommandMetadata || {}).url) || '';
    const want = { videos: '/videos', shorts: '/shorts', live: '/streams', playlists: '/playlists' }[tab] || '/videos';
    const empty = tab === 'playlists' ? { lists: [], next: null } : { items: [], next: null };
    if (selUrl && !selUrl.endsWith(want)) return empty;
    const r = ytTabItems(d, tab, ch);
    if (!(r.items || r.lists).length) {
      if (walk(d, 'richItemRenderer').length || walk(d, 'gridRenderer').length) throw new Error('شكل جديد من يوتيوب'); // خلّي السيرفرات العامة تجرّب
      return empty;
    }
    return mark(r);
  },
  async related(id) {
    const d = await ytNext(id);
    const sec = ((d.contents || {}).twoColumnWatchNextResults || {}).secondaryResults || d;
    const list = uniqById(walk(sec, 'lockupViewModel').map(l => fromLockup(l)).concat(walk(sec, 'compactVideoRenderer').map(fromVR)))
      .filter(v => v.id !== id);
    if (!list.length) throw new Error('فاضي');
    return list;
  },
};
// معلومات صفحة الفيديو (عنوان، قناة، مشاهدات، إعجابات، وصف، مشابه) من يوتيوب مباشرة
YtApi.watch = async function (id) {
  const d = await ytNext(id);
  const pr = walk(d, 'videoPrimaryInfoRenderer')[0];
  const se = walk(d, 'videoSecondaryInfoRenderer')[0];
  if (!pr || !se) throw new Error('ما في معلومات');
  const o = (se.owner || {}).videoOwnerRenderer || {};
  const by = ((o.title || {}).runs || [])[0] || {};
  const vt = ytTxt(((pr.viewCount || {}).videoViewCountRenderer || {}).viewCount);
  const like = walk(walk(d, 'likeButtonViewModel'), 'buttonViewModel')[0] || {};
  const sec = ((d.contents || {}).twoColumnWatchNextResults || {}).secondaryResults || {};
  return {
    id, title: ytTxt(pr.title), author: by.text || '', authorId: ((by.navigationEndpoint || {}).browseEndpoint || {}).browseId || '',
    avatar: httpsUrl(lastThumb(o.thumbnail)), subs: ytTxt(o.subscriberCountText).replace(/\u00a0/g, ' '),
    views: parseCount(vt), viewsText: vt,
    published: ytTxt(pr.relativeDateText) || ytTxt(pr.dateText).replace(/\u200f/g, ''),
    likes: parseCount(like.accessibilityText) || parseCount(like.title) || 0,
    description: ytDescription(se.attributedDescription, id),
    related: uniqById(walk(sec, 'lockupViewModel').map(l => fromLockup(l)).concat(walk(sec, 'compactVideoRenderer').map(fromVR))).filter(v => v.id !== id),
  };
};
// الوصف: يوتيوب بيقصّر الروابط وبيحط بطاقات فيديو — منرجّعهن روابط كاملة لحتى تنكبس
function ytDescription(ad, selfId) {
  if (!ad || !ad.content) return '';
  let s = ad.content;
  const runs = (ad.commandRuns || []).slice().sort((a, b) => b.startIndex - a.startIndex); // من الآخر للأول
  for (const r of runs) {
    const seg = s.substr(r.startIndex, r.length);
    const ue = walk(r, 'urlEndpoint')[0], we = walk(r, 'watchEndpoint')[0];
    let rep = null;
    if (ue && ue.url) {
      let u = ue.url;
      try { const x = new URL(u, 'https://www.youtube.com'); u = x.pathname === '/redirect' ? x.searchParams.get('q') || x.href : x.href; } catch { /* */ }
      if (!/^https?:\/\//.test(seg.trim()) || seg.includes('…') || seg.includes('...')) rep = u;
    } else if (we && we.videoId && we.videoId !== selfId) {
      rep = `${seg.replace(/^\s*•\s*/, '').trim()} https://youtu.be/${we.videoId}`;
    }
    if (rep != null) s = s.slice(0, r.startIndex) + rep + s.slice(r.startIndex + r.length);
  }
  return s;
}

// فيديوهات مشابهة: من يوتيوب مباشرة، والسيرفرات العامة احتياط
const ytNext = id => cached('nx:' + id, 10 * 60e3, () => yti('next', { videoId: id }));
const relatedOf = id => cached('rel:' + id, 20 * 60e3, () => (ytiUsable() ? YtApi.related(id) : Promise.reject(new Error('x')))
  .catch(() => getVideo(id).then(r => r.res.related)));

/* ================= مصدر الفيديو الخاص فينا (خدمة nuvio-stream على PH24) =================
   بيجيب الفيديو من يوتيوب ويمرّقو لإلنا — أسرع وأثبت من السيرفرات العامة. إذا وقف، منرجع للعامة. */
const SV = 'https://tube.glanzstar.de/sv';
const COMP = 'https://tube.glanzstar.de/companion'; // Invidious Companion: احتياط تاني (بيوقف لما يوتيوب يشك بالسيرفر)
// مصدرنا بيلزّق كل قطعة من أول مصدر شغّال (yt-dlp كامل / IOS / companion)، وآخر احتياط عنا نسخة 360p بملف واحد
const ownMp4 = id => `${SV}/mp4/${id}`;
const compMpd = id => `${COMP}/api/manifest/dash/id/${id}?local=true`;
// روابط الملف بتبلّش بـ «/companion/…»؛ منكمّلها لرابط كامل (الملف بيتحمّل كـ data: بلا عنوان)
const absMpd = (text, url) => { try { return text.replace(/<BaseURL>\//g, `<BaseURL>${new URL(url).origin}/`); } catch { return text; } };
const OWN_INST = { url: SV, type: 'own' };
if (self.caches) { caches.delete('nuvio-low-v1').catch(() => {}); caches.delete('nuvio-tiers-v1').catch(() => {}); } // التحميل المسبق الكبير انلغى: منفضّي محلّو عالجهاز
const ownMpd = id => `${SV}/dash/${id}.mpd`;
let svDown = 0;
const svUsable = () => Date.now() - svDown > 3 * 60e3;
function svCheck() { // إذا فشل، منشوف إذا الخدمة نفسها واقفة
  fetch(`${SV}/health`, { cache: 'no-store' }).then(r => { if (!r.ok) svDown = Date.now(); }).catch(() => { svDown = Date.now(); });
}

/* ================= من جهازك: إضافة «Nuvio Direct» (مجلّد nuvio-ext) =================
   إذا الإضافة مركّبة (بتحط data-nuvio-ext على <html>)، منطلب روابط الفيديو من يوتيوب مباشرة من شبكتك
   (عميل VISIONOS: بلا PO token وما بينقطع بالنص)، ومنبني ملف DASH هون، والفيديو بينزل من googlevideo لعندك
   بلا سيرفرنا. الإضافة بس بتشيل «Origin» عن طلبات يوتيوب وبتسمح للصفحة تقرا الجواب (CORS).
   مع الإضافة ما في ولا طلب لسيرفرنا (لا فيديو ولا بحث): إذا ما زبط من جهازك، مشغّل يوتيوب مباشرة.
   بلا الإضافة ما بيتغيّر شي: سيرفرنا، وبعدين مشغّل يوتيوب. (extOn/extUsable فوق، جنب YTI) */
const XCLIENT = { clientName: 'VISIONOS', clientVersion: '1.02', deviceMake: 'Apple', deviceModel: 'RealityDevice17,1', osName: 'visionOS', osVersion: '26.5.23O471', hl: 'en' };
async function ytDirect(ep, body, ms = 8000) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try {
    let r;
    try {
      r = await fetch(`https://www.youtube.com/youtubei/v1/${ep}?prettyPrint=false`, {
        method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, // طلب بسيط: بلا طلب استئذان (preflight)
        body: JSON.stringify(body),
      });
    } catch (e) { if (e && e.name !== 'AbortError') extDown = Date.now(); throw e; } // انرفض (CORS): الإضافة مش شغّالة متل ما لازم
    if (!r.ok) { if (r.status === 403) extDown = Date.now(); throw new Error('HTTP ' + r.status); } // 403 = «Origin» لسّا موجود
    return await r.json();
  } finally { clearTimeout(tm); }
}
// «رقم زائر» من يوتيوب (بلاه بيقول «بوت»): بينحفظ يوم على الجهاز
let xvd = null, xvdP = null;
function extVisitor(fresh) {
  if (!fresh) {
    if (xvd && Date.now() - xvd.at < 24 * 3600e3) return Promise.resolve(xvd.v);
    try { const s = JSON.parse(localStorage.getItem('nuvio:xvd') || 'null'); if (s && s.v && Date.now() - s.at < 24 * 3600e3) { xvd = s; return Promise.resolve(s.v); } } catch { /* */ }
    if (xvdP) return xvdP;
  }
  xvdP = ytDirect('visitor_id', { context: { client: XCLIENT } }, 5000).then(j => {
    const v = (j.responseContext || {}).visitorData;
    if (!v) throw new Error('ما في رقم زائر');
    xvd = { v, at: Date.now() };
    try { localStorage.setItem('nuvio:xvd', JSON.stringify(xvd)); } catch { /* */ }
    return v;
  }).finally(() => { xvdP = null; });
  return xvdP;
}
async function extPlayer(id) {
  for (let k = 0; k < 2; k++) {
    const visitorData = await extVisitor(k > 0);
    const j = await ytDirect('player', { context: { client: { ...XCLIENT, visitorData } }, videoId: id, contentCheckOk: true, racyCheckOk: true });
    const st = (j.playabilityStatus || {}).status;
    if (st === 'OK' && ((j.streamingData || {}).adaptiveFormats || []).some(f => f.url)) return j;
    if (st !== 'LOGIN_REQUIRED' || k) throw new Error(st || 'NO_STREAMS'); // «بوت»؟ رقم زائر جديد ومرة كمان
  }
}
// نفس فلترة سيرفرنا (nuvio-stream/server.mjs): avc1/vp9 + صوت m4a عادي، بلا AV1 ولا DRC ولا HE-AAC
function extParse(id, j) {
  const vd = j.videoDetails || {};
  const dur = +vd.lengthSeconds || 0;
  const fmts = new Map();
  for (const f of j.streamingData.adaptiveFormats || []) {
    if (!f.url || !f.initRange || !f.indexRange || f.isDrc) continue;
    if (/av01/.test(f.mimeType) || /^audio\/webm/.test(f.mimeType) || /mp4a\.40\.(5|29)/.test(f.mimeType)) continue;
    const track = f.audioTrack ? f.audioTrack.id : '';
    const key = f.itag + (track ? '~' + track : '');
    if (!fmts.has(key)) fmts.set(key, { ...f, key, track });
  }
  const caps = ((j.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks || [];
  return {
    id, title: vd.title || '', duration: dur, live: !!vd.isLiveContent && !dur, fmts,
    captions: caps.filter(c => c.baseUrl).map(c => {
      const label = (c.name && (c.name.simpleText || (c.name.runs || []).map(r => r.text).join(''))) || c.languageCode;
      const auto = c.kind === 'asr';
      return { lang: c.languageCode, label: label + (auto && !/auto/i.test(label) ? ' (تلقائي)' : ''), url: c.baseUrl + '&fmt=vtt', auto };
    }),
  };
}
const xEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// ملف DASH (نفس mpd() تبع السيرفر)، بس الروابط لـ googlevideo مباشرة
function extMpd(d) {
  const dur = d.duration || Math.round(Math.max(...[...d.fmts.values()].map(f => +f.approxDurationMs || 0)) / 1000);
  const groups = new Map(); // mime|track -> []
  for (const f of d.fmts.values()) {
    const g = f.mimeType.split(';')[0] + '|' + (f.track || '');
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(f);
  }
  let i = 0;
  const sets = [];
  for (const [g, list] of groups) {
    const [mime, track] = g.split('|');
    const audio = mime.startsWith('audio');
    const f0 = list[0];
    const lang = track ? track.split('.')[0] : (audio ? 'und' : '');
    const isDefault = !f0.audioTrack || f0.audioTrack.audioIsDefault;
    const reps = list.map(f => {
      const codecs = (f.mimeType.match(/codecs="([^"]+)"/) || [])[1] || '';
      const attrs = audio ? `audioSamplingRate="${f.audioSampleRate || 44100}"` : `width="${f.width || 0}" height="${f.height || 0}" frameRate="${f.fps || 30}"`;
      return `      <Representation id="${xEsc(f.key)}" codecs="${xEsc(codecs)}" bandwidth="${f.bitrate || f.averageBitrate || 0}" ${attrs}>
${audio ? `        <AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="${f.audioChannels || 2}"/>\n` : ''}        <BaseURL>${xEsc(f.url)}</BaseURL>
        <SegmentBase indexRange="${f.indexRange.start}-${f.indexRange.end}"><Initialization range="${f.initRange.start}-${f.initRange.end}"/></SegmentBase>
      </Representation>`;
    }).join('\n');
    const label = audio && f0.audioTrack ? ` label="${xEsc(f0.audioTrack.displayName || lang)}"` : '';
    const role = audio && track ? `\n      <Role schemeIdUri="urn:mpeg:dash:role:2011" value="${isDefault ? 'main' : 'alternate'}"/>` : '';
    sets.push(`    <AdaptationSet id="${i++}" contentType="${audio ? 'audio' : 'video'}" mimeType="${mime}" subsegmentAlignment="true"${lang ? ` lang="${xEsc(lang)}"` : ''}${label}>${role}
${reps}
    </AdaptationSet>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" type="static" mediaPresentationDuration="PT${dur}S" minBufferTime="PT1.5S">
  <Period duration="PT${dur}S">
${sets.join('\n')}
  </Period>
</MPD>`;
}
// ملف DASH من جهازك: { text, final, data } — بينحفظ 4 دقايق (الروابط مربوطة بشبكتك، فإذا علّق منجيب جديد)
const extManifest = id => cached('xmf:' + id, 4 * 60e3, async () => {
  const d = extParse(id, await extPlayer(id));
  const kinds = new Set([...d.fmts.values()].map(f => f.mimeType.split('/')[0]));
  if (d.live || !kinds.has('video') || !kinds.has('audio')) throw new Error('مباشر أو ما في مصادر');
  return { text: extMpd(d), final: 'nuvioext://direct/' + id, data: d };
});
// صوت الفيديو لحالو (للتشغيل بالخلفية): m4a العادي
const extAudio = d => { const l = [...d.fmts.values()]; const a = l.find(f => f.itag === 140 && (!f.audioTrack || f.audioTrack.audioIsDefault)) || l.find(f => /^audio\/mp4/.test(f.mimeType)); return a ? a.url : ''; };

const apiFor = inst => (inst.type === 'yti' ? YtApi : inst.type === 'piped' ? Piped : Invidious);

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
        const related = await relatedOf(id);
        const fresh = related.filter(v => v.id && !seen.has(v.id) && wanted(v));
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
function prefetchVideo(id, deep) {
  if (extUsable()) { if (deep) extManifest(id).catch(() => {}); return; } // من جهازك: بلا سيرفرنا
  if (svUsable()) { if (deep) manifestText(ownMpd(id)).catch(() => {}); return; } // كمان بيصحّي «الكامل» عالسيرفر
  const p = getVideo(id);
  if (deep) p.then(({ res }) => { const d = res.sources.find(s => s.kind === 'dash'); if (d) manifestText(d.url).catch(() => {}); }).catch(() => {});
  else p.catch(() => {});
}

function card(v, { row = false, noAuthorLink = false } = {}) {
  preview.set(v.id, v);
  if (v.authorId && v.author) chPreview.set(v.authorId, { name: v.author });
  const c = $('#cardTpl').content.firstElementChild.cloneNode(true);
  if (row) c.classList.add('row');
  c.href = v.short ? `#/shorts?v=${encodeURIComponent(v.id)}${v.authorId ? `&ch=${encodeURIComponent(v.authorId)}` : ''}` : `#/watch?v=${encodeURIComponent(v.id)}`;
  c.dataset.vid = v.id;
  if (v.authorId) c.dataset.ch = v.authorId;
  if (v.short) {
    c.dataset.short = '1';
    // الشورتس من صفحة القناة: منحفظ ترتيبها لحتى تكمّل فيها بالسحب
    c.addEventListener('click', () => {
      const list = [...(c.parentElement ? c.parentElement.querySelectorAll('a.card[data-short]') : [])].map(x => preview.get(x.dataset.vid)).filter(Boolean);
      shortsCtx = { ch: v.authorId || '', items: list };
    });
  }
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
  const rest = [views, arAgo(v.published)].filter(Boolean).join(' • ');
  if (rest) sub.append((v.author ? ' • ' : '') + rest);
  const wb = progBar(v.id); if (wb) c.querySelector('.thumb').append(wb);
  const cav = el(v.authorId ? 'span' : 'span', 'card-av');
  if (v.avatar) { const ai = el('img'); ai.alt = ''; ai.loading = 'lazy'; ai.referrerPolicy = 'no-referrer'; ai.src = v.avatar; cav.append(ai); }
  else cav.textContent = (v.author || '?').trim().replace(/^@/, '').charAt(0);
  if (v.authorId) cav.onclick = e => { e.preventDefault(); e.stopPropagation(); location.hash = chHref(v.authorId); };
  c.querySelector('.meta').prepend(cav);
  const mb = el('button', 'card-menu'); mb.setAttribute('aria-label', 'خيارات');
  mb.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="5.5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="18.5" r="1.8"/></svg>';
  mb.onclick = e => { e.preventDefault(); e.stopPropagation(); cardMenu(v); };
  c.querySelector('.meta').append(mb);
  let pre;
  const warm = () => { clearTimeout(pre); pre = setTimeout(() => { if (ytiUsable()) ytNext(v.id).catch(() => {}); }, 400); };
  c.addEventListener('pointerenter', warm);
  c.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') prefetchVideo(v.id, true); }); // كبسة الماوس: منبلّش قبل ما تفلت
  c.addEventListener('pointerleave', () => clearTimeout(pre));
  return c;
}

/* صور القنوات: منصلّح الاسم الفرعي المعطوب، وإذا فشلت منجيبها من ggpht مباشرة */
async function setImg(img, url) {
  if (!url) { img.remove(); return; }
  img.referrerPolicy = 'no-referrer';
  img.decoding = 'async';
  const m = url.match(/\/ggpht\/(.+)$/);
  if (m) {
    img.onerror = async () => { if (!img.dataset.via) { img.dataset.via = '1'; img.src = await fixUrl(url); } };
    img.src = 'https://yt3.ggpht.com/' + m[1];
    return;
  }
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
const slim = v => ({ id: v.id, title: v.title, thumb: v.thumb || ytThumb(v.id), author: v.author, authorId: v.authorId, duration: v.duration, views: v.views, published: v.published, ...(v.short ? { short: true } : {}), ...(v.music ? { music: true } : {}), ...(v.avatar ? { avatar: v.avatar } : {}) });
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
const GENERAL_TOPICS = ['وثائقي', 'أغاني عربية', 'كوميديا', 'طبخ', 'رياضة', 'تقنية', 'ألعاب فيديو', 'سفر', 'مسلسلات', 'علوم', 'أفلام', 'كرة قدم', 'برامج عربية', 'مقالب'];
/* الوقت اللي بيجي بالإنكليزي من السيرفرات العامة («23 hours ago») → بالعربي */
const AR_UNITS = { second: ['ثانية', 'ثانيتين', 'ثواني'], minute: ['دقيقة', 'دقيقتين', 'دقايق'], hour: ['ساعة', 'ساعتين', 'ساعات'], day: ['يوم', 'يومين', 'أيام'], week: ['أسبوع', 'أسبوعين', 'أسابيع'], month: ['شهر', 'شهرين', 'أشهر'], year: ['سنة', 'سنتين', 'سنين'] };
function arAgo(s) {
  s = String(s || '');
  if (!/[a-z]/i.test(s)) return s;
  const st = /^\s*streamed/i.test(s) ? 'بُثّ ' : '';
  const m = /(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i.exec(s);
  if (!m) return st ? s.replace(/^\s*streamed\s*/i, st) : s;
  const n = +m[1], u = AR_UNITS[m[2].toLowerCase()];
  return `${st}قبل ${n === 1 ? u[0] : n === 2 ? u[1] : n <= 10 ? `${n} ${u[2]}` : `${n} ${u[0]}`}`;
}

/* خلاصة منوّعة: كل مصدر (فيديو شفتو، بحث عملتو، إعجاب، مواضيع عامة عشوائية) بياخد دور صغير بكل دفعة،
   وما في قناة وحدة بتاخد أكتر من فيديوين بالدفعة. لهيك ما بيغلب «مستر بيست» أو غيرو. */
function makeHomeFeed(seen) {
  const watched = new Set(lib.list('hist').map(v => v.id));
  const hist = lib.list('hist').slice(0, 10), likes = lib.list('likes').slice(0, 5), favs = lib.list('favs').slice(0, 5);
  const searches = store.get('searches', []).slice(0, 6);
  const seeds = [];
  for (let i = 0; i < 10; i++) for (const v of [hist[i], likes[i], favs[i]]) if (v && !seeds.some(s => s.id === v.id)) seeds.push(v);
  const searchSrc = q => () => cached('s:' + q, 10 * 60e3, () => withFallback(x => apiFor(x).search(x.url, q, 1), { yti: true })).then(r => r.res.items);
  // «رائج» من يوتيوب نفسو (هالأسبوع، الأكثر مشاهدة) بدل السيرفرات العامة الأمريكية
  const popSrc = q => () => cached('pop:' + q, 30 * 60e3, () => YtApi.search(YTI, q, 1, null, { date: 'week', sort: 'view_count' })).then(r => r.items);
  const relSrc = id => () => relatedOf(id);
  const chSrc = (id, n) => () => getChannel(id).then(r => r.res.items.slice(0, n));
  const subIds = new Set(store.get('subs', []).map(c => c.id));
  const sources = [
    // متل يوتيوب: آخر شي حضرتو هو الأقوى (آخر 3 فيديوهات بياخدو دورين بكل جولة)
    ...seeds.map((v, i) => ({ load: relSrc(v.id), w: i < 3 && hist.some(h => h.id === v.id) ? 2 : 1 })),
    ...searches.map(q => ({ load: searchSrc(q) })),
    ...shuffle(store.get('subs', [])).slice(0, 6).map(c => ({ load: chSrc(c.id, 8) })),
    // قنوات بتحضرها كتير حتى لو مش مشترك فيها: أحدث فيديوهاتها
    ...favChannels(4).filter(id => !subIds.has(id)).map(id => ({ load: chSrc(id, 6) })),
    ...shuffle(GENERAL_TOPICS).slice(0, 2).map(q => ({ load: popSrc(q) })),
    ...shuffle(GENERAL_TOPICS).slice(0, 2).map(q => ({ load: searchSrc(q) })),
  ].map(s => ({ w: 1, ...s, pool: null, dead: false }));
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
      const pick = s => {
        let tries = 0;
        while (s.pool.length && tries++ < 6) {
          const v = s.pool.shift();
          if (seen.has(v.id)) continue;
          if (watched.has(v.id)) { seen.add(v.id); continue; }
          const a = v.authorId || v.author || '';
          if ((perAuthor[a] || 0) >= 2) { s.pool.push(v); continue; }
          perAuthor[a] = (perAuthor[a] || 0) + 1;
          seen.add(v.id); expandIds.push(v.id); out.push(v);
          return;
        }
      };
      for (let round = 0; round < 3 && out.length < 18; round++) {
        for (const s of live) for (let k = 0; k < (s.w || 1); k++) pick(s);
      }
      // لحتى يضل لا نهائي: كل ما قلّت المصادر منضيف مشابهات فيديوهات عشوائية من اللي طلعو
      if (sources.filter(s => !s.dead && (!s.pool || s.pool.length)).length < 6) {
        for (let k = 0; k < 3 && expandIds.length; k++) {
          const id = expandIds.splice(Math.floor(Math.random() * expandIds.length), 1)[0];
          sources.push({ load: relSrc(id), w: 1, pool: null, dead: false });
        }
        if (Math.random() < 0.5) sources.push({ load: popSrc(GENERAL_TOPICS[Math.floor(Math.random() * GENERAL_TOPICS.length)]), w: 1, pool: null, dead: false });
      }
      if (out.length) return out;
      if (!sources.some(s => !s.dead && (!s.pool || s.pool.length))) return [];
    }
    return [];
  };
}

/* القنوات اللي بتحضرها كتير (من سجلّك): الأكثر أول */
function favChannels(n) {
  const cnt = {};
  for (const v of lib.list('hist').slice(0, 80)) if (v.authorId) cnt[v.authorId] = (cnt[v.authorId] || 0) + 1;
  return Object.entries(cnt).filter(([, k]) => k >= 2).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
}

/* ---- شرائح المواضيع فوق الرئيسية (متل يوتيوب): «الكل» = خلاصتك، والباقي خلاصة لموضوع واحد ---- */
const CHIP_TOPICS = [
  ['new', 'محتوى جديد لك'],
  ['music', 'موسيقى', 'أغاني'], ['mix', 'مكسات', 'مكس أغاني'], ['live', 'مباشر', 'بث مباشر', { feat: 'live' }],
  ['games', 'ألعاب فيديو', 'ألعاب فيديو'], ['podcast', 'بودكاست', 'بودكاست'], ['news', 'أخبار', 'أخبار', { date: 'today' }],
  ['sport', 'رياضة', 'رياضة'], ['series', 'مسلسلات', 'مسلسلات'], ['cook', 'طبخ', 'وصفات طبخ'], ['comedy', 'كوميديا', 'كوميديا'], ['doc', 'وثائقي', 'وثائقي'],
  ['recent', 'محمّلة مؤخراً'], ['watched', 'شاهدتها'],
];
let homeChip = 'all';
function homeChipList() {
  const mine = [];
  for (const s of store.get('searches', [])) {
    if (mine.length >= 3) break;
    const q = String(s).trim();
    if (q && q.length <= 24 && !/^https?:/i.test(q) && !mine.some(m => m[2].toLowerCase() === q.toLowerCase())) mine.push(['q:' + q, q, q]);
  }
  return [['all', 'الكل'], ...CHIP_TOPICS.slice(0, 1), ...mine, ...CHIP_TOPICS.slice(1)];
}
function homeChipBar() {
  const bar = el('div', 'home-chips');
  const row = el('div', 'hchips');
  for (const c of homeChipList()) {
    const b = el('button', 'hchip' + (c[0] === homeChip ? ' on' : ''), c[1]); b.dir = 'auto';
    b.onclick = () => { if (homeChip === c[0]) return; homeChip = c[0]; window.scrollTo(0, 0); renderHome(); };
    row.append(b);
  }
  // عالكمبيوتر: عجلة الماوس بتحرّك الشرائح يمين وشمال
  row.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { row.scrollLeft -= e.deltaY; e.preventDefault(); } }, { passive: false });
  bar.append(row);
  requestAnimationFrame(() => { const on = row.querySelector('.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' }); });
  return bar;
}
function chipFeed(c, seen) {
  const [k, , q, f] = c;
  const fresh = list => list.filter(v => v && v.id && !seen.has(v.id) && (seen.add(v.id), true));
  if (k === 'watched') { let done = false; return async () => { if (done) return []; done = true; return lib.list('hist').slice(0, 80); }; }
  if (k === 'new') { // اشتراكاتك + القنوات اللي بتحضرها: الأحدث أول
    let done = false;
    return async () => {
      if (done) return []; done = true;
      const ids = [...new Set([...store.get('subs', []).map(x => x.id), ...favChannels(6)])].slice(0, 14);
      const lists = await Promise.allSettled(ids.map(id => getChannel(id).then(r => r.res.items.slice(0, 6))));
      const all = fresh(uniqById(lists.flatMap(x => (x.status === 'fulfilled' ? x.value : []))));
      return all.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    };
  }
  if (k === 'recent') { // من مواضيعك وبحوثك: اللي انرفع هالأسبوع
    const qs = [...store.get('searches', []).slice(0, 4), ...shuffle(GENERAL_TOPICS).slice(0, 2)];
    let i = 0;
    return async () => {
      while (i < qs.length) {
        const r = await YtApi.search(YTI, qs[i++], 1, null, { date: 'week', sort: 'upload_date' }).catch(() => null);
        const l = r ? fresh(r.items) : [];
        if (l.length) return l;
      }
      return [];
    };
  }
  // موضوع: بحث يوتيوب مع التكملة (لا نهائي)
  let next = null, first = true;
  return async () => {
    if (!first && !next) return [];
    const r = first ? await YtApi.search(YTI, q, 1, null, f || {}) : await YtApi.search(YTI, q, 1, next);
    first = false; next = r.next;
    return fresh(r.items);
  };
}
// كم عمود بالشبكة هلّق (لحتى رف الشورتس ييجي بعد صفّين كاملين، بلا كرت لحالو بسطر)
const gridCols = g => Math.max(1, getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length);

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
    // أول اشتراك: آخر فيديو هلّق هو الأساس (النقطة بتطلع بس للجديد بعد هيك)
    if (on) getChannel(ch.id).then(({ res }) => { const top = res.items && res.items[0] && res.items[0].id; if (top && !(ch.id in chNew.seen())) chNew.markSeen(ch.id, top); }).catch(() => {});
    draw();
    note(on ? `اشتركت بـ ${ch.name}` : `لغيت الاشتراك بـ ${ch.name}`);
  };
  return b;
}
/* صورة قناة مدوّرة + اسم (للصفوف) */
const avatarAsked = new Set();
function fillAvatar(id, avatar) {
  if (!id || !avatar) return;
  for (const k of ['subs', 'artists']) {
    const arr = store.get(k, []);
    const it = arr.find(x => x.id === id && !x.avatar);
    if (it) { it.avatar = avatar; store.set(k, arr); }
  }
}
function channelBubble(c) {
  const a = el('a', 'sub-chip'); a.href = chHref(c.id); a.dir = 'auto';
  chPreview.set(c.id, { name: c.name });
  a.onpointerenter = () => getChannel(c.id).catch(() => {});
  const img = el('img'); img.alt = ''; img.loading = 'lazy';
  const ph = el('span', 'sub-ph', (c.name || '?').trim().charAt(0));
  if (chNew.has(c.id)) {
    a.classList.add('new');
    a.addEventListener('click', () => { const tp = chNew.tops()[c.id]; if (tp) chNew.markSeen(c.id, tp.top); });
  }
  if (c.avatar) setImg(img, c.avatar);
  else if (c.id && !avatarAsked.has(c.id)) {
    // ما في صورة محفوظة: منجيبها من القناة، ومنحطها مكان الحرف
    avatarAsked.add(c.id);
    getChannel(c.id).then(({ res }) => {
      const av = res && res.info && res.info.avatar;
      if (!av) return;
      if (ph.isConnected) { setImg(img, av); ph.replaceWith(img); }
      fillAvatar(c.id, av);
    }).catch(() => {});
  }
  a.append(c.avatar ? img : ph, el('span', null, c.name));
  return a;
}

/* أقسام «حيّة»: بتنبنى من بياناتك المحفوظة (اشتراكات، سجل، بحث، مطربين…)
   وبتتحدّث لحالها أول ما يتغيّر شي — بلا ما تحدّث الصفحة كلها */
const liveVer = keys => keys.map(k => storeVer[k] || 0).join(',');
function fillLive(box) {
  box._ver = liveVer(box._keys);
  box.replaceChildren(...(box._build() || []).filter(Boolean));
}
function liveSection(keys, build) {
  const box = el('div', 'live');
  box._keys = keys; box._build = build;
  fillLive(box);
  return box;
}
function refreshLive() {
  view.querySelectorAll('.live').forEach(box => {
    if (box._ver === liveVer(box._keys)) return;
    const r = box.getBoundingClientRect();
    const above = r.bottom <= 0, h = r.height;
    fillLive(box);
    if (above) window.scrollBy(0, box.getBoundingClientRect().height - h); // ما منخلّي الصفحة تنط
  });
}
let liveT = 0;
window.addEventListener('nuvio:store', () => { clearTimeout(liveT); liveT = setTimeout(refreshLive, 60); });
/* عنوان قسم + «الكل» */
function sectionHead(title, href, icon) {
  const head = el('div', 'sec-head');
  const h = el('h2', 'section-title');
  if (icon && window.ico) { const s = el('span', 'sec-ico'); s.innerHTML = window.ico(icon); h.append(s); }
  h.append(title);
  head.append(h);
  if (href) { const a = el('a', 'sec-more', 'الكل'); a.href = href; head.append(a); }
  return head;
}

/* ================= الصفحات ================= */
/* راس الرئيسية: سجل البحث، القنوات، آخر اللي شفتو (قسم حي) */
function homeTop() {
  const out = [];
  const build = {
    // سجل البحث
    searches() {
      const searches = store.get('searches', []).slice(0, 14);
      if (!searches.length) return;
      const row = el('div', 'chips');
      searches.forEach(s => { const a = el('a', 'chip-q', s); a.href = `#/search?q=${encodeURIComponent(s)}`; a.dir = 'auto'; row.append(a); });
      out.push(sectionHead('سجل البحث', '#/searches'), row);
    },
    // القنوات المشترك فيها
    subs() {
      const mySubs = subs.list().slice(0, 30).sort((x, y) => chNew.has(y.id) - chNew.has(x.id)).slice(0, 20); // الجديد أول
      if (!mySubs.length) return;
      const row = el('div', 'sub-strip');
      mySubs.forEach(c => row.append(channelBubble(c)));
      out.push(sectionHead('القنوات', '#/subs'), row);
    },
    // آخر اللي شفتو
    hist() {
      const hist = lib.list('hist').slice(0, 16);
      if (!hist.length) return;
      const shelf = el('div', 'shelf');
      hist.forEach(v => shelf.append(card(v)));
      out.push(sectionHead('آخر اللي شفتو', '#/history'), shelf);
    },
  };
  // الترتيب والتشغيل من الإعدادات («الصفحة الرئيسية»)
  for (const s of homeSecs()) if (s.on && build[s.k]) build[s.k]();
  return out;
}
async function renderHome(force) {
  document.title = 'Nuvio — فيديو بلا إعلانات';
  const chips = homeChipBar();
  // شريحة غير «الكل»: خلاصة الموضوع بس (متل يوتيوب)
  const chip = homeChip !== 'all' && homeChipList().find(c => c[0] === homeChip);
  if (chip) {
    view.replaceChildren(chips);
    const g = el('div', 'grid feed'); g.append(skCards(9));
    view.append(g);
    const feed = chipFeed(chip, new Set());
    try {
      let first = (await feed()).filter(v => chip[0] === 'watched' || suggestOk(v));
      if (!g.isConnected) return;
      g.replaceChildren();
      if (!first.length) throw new Error('فاضي');
      first.forEach(v => g.append(card(v)));
      infinite(g, async () => { const more = await feed(); more.filter(v => chip[0] === 'watched' || suggestOk(v)).forEach(v => g.append(card(v))); return more.length > 0; });
    } catch {
      if (!g.isConnected) return;
      g.replaceWith(el('div', 'empty', chip[0] === 'watched' ? 'ما حضرت شي لسّا.' : chip[0] === 'new' ? 'اشترك بقنوات أو احضر فيديوهات، وبيطلعلك هون الجديد منها.' : 'ما لقيت شي هلّق — جرّب بعد شوي.'));
    }
    return;
  }
  view.replaceChildren(chips, liveSection(['searches', 'subs', 'hist', 'chTop', 'chSeen', 'prefs'], homeTop));
  setTimeout(() => refreshChannelTops(), 2500);
  const personal = store.get('searches', []).length || subs.list().length || lib.list('hist').length;
  // ٤) مقترح لك (بيتحمّل شوي شوي مع التمرير)
  view.append(sectionHead(personal ? 'مقترح لك' : 'مقترحات'));
  const g = el('div', 'grid feed'); g.append(skCards(9));
  view.append(g);
  const seen = new Set();
  const feed = makeHomeFeed(seen);
  // القائمة بتنحفظ على الجهاز: لمّا تفتح الموقع بتلاقي آخر قائمة فوراً، وبتتجدّد بس بالسحب للتحديث
  const kept = [];
  const keep = items => { kept.push(...items.map(slim)); if (kept.length <= 120) store.set('homeFeed', { at: Date.now(), items: kept, v: 2 }); };
  const saved = !force && store.get('homeFeed', null);
  try {
    let first = [];
    // (v: 2 = الخوارزمية الجديدة؛ القديمة كان فيها رائج أمريكي — منتركها)
    if (saved && saved.v === 2 && saved.items && saved.items.length && Date.now() - saved.at < 3 * 86400e3) {
      first = saved.items.filter(v => v && v.id);
      first.forEach(v => seen.add(v.id));
      kept.push(...first);
      // صارت قديمة (أكتر من 6 ساعات)؟ منجهّز وحدة جديدة بالخلفية، وبتبيّن بالفتحة الجاية (بلا ما تنط الصفحة هلّق)
      if (Date.now() - saved.at > 6 * 3600e3) makeHomeFeed(new Set())().then(m => { if (m && m.length) store.set('homeFeed', { at: Date.now(), items: m.map(slim), v: 2 }); }).catch(() => {});
    } else {
      first = await feed();
      keep(first);
    }
    let shownFirst = first.filter(suggestOk);
    for (let k = 0; !shownFirst.length && k < 3; k++) { const m = await feed(); keep(m); shownFirst = m.filter(suggestOk); if (!m.length) break; }
    // أول دفعة لازم تعبّي صفّين عالأقل (عالشاشات الكبيرة)
    for (let k = 0; shownFirst.length < 12 && k < 2; k++) { const m = await feed(); keep(m); shownFirst = shownFirst.concat(m.filter(suggestOk)); if (!m.length) break; }
    if (!g.isConnected) return;
    g.replaceChildren();
    if (!shownFirst.length) throw new Error('فاضي');
    shownFirst.forEach(v => g.append(card(v)));
    // رف الشورتس جوّا الخلاصة: بعد صفّين كاملين (متل يوتيوب)
    if (ytiUsable()) {
      const sr = homeShortsRow();
      const at = gridCols(g) * 2;
      if (g.children.length > at) g.insertBefore(sr, g.children[at]); else g.append(sr);
    }
    infinite(g, async () => { const more = await feed(); more.filter(suggestOk).forEach(v => g.append(card(v))); keep(more); return more.length > 0; });
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
    const ic = el('span', 'search-ico'); ic.innerHTML = window.ico('clock');
    row.append(ic, a, x);
    box.append(row);
  });
  view.append(box);
}

/* ---- القنوات المشترك فيها + آخر فيديوهاتها ---- */
async function renderSubs(mode = 'new') {
  document.title = 'القنوات — Nuvio';
  const list = subs.list();
  setTimeout(() => refreshChannelTops(), 2500);
  const top = liveSection(['subs', 'chTop', 'chSeen'], () => {
    const l = subs.list().slice().sort((x, y) => chNew.has(y.id) - chNew.has(x.id));
    const strip = el('div', 'sub-strip');
    l.forEach(c => strip.append(channelBubble(c)));
    return [sectionHead(`القنوات المشترك فيها (${l.length})`), l.length ? strip : null];
  });
  view.replaceChildren(top);
  if (!list.length) { view.append(el('div', 'empty', 'ما في اشتراكات لسّا. اكبس «اشتراك» بصفحة أي قناة أو تحت أي فيديو.')); return; }
  // فلترة بخط واحد (على الفيديوهات اللي إجت)
  const MODES = [['new', 'الأحدث'], ['views', 'الأكثر مشاهدة'], ['old', 'الأقدم'], ['today', 'اليوم'], ['week', 'هالأسبوع'], ['month', 'هالشهر'], ['short', 'قصير'], ['long', 'طويل']];
  const bar = chipBar(MODES, mode, m => { location.hash = m === 'new' ? '#/subs' : `#/subs?f=${m}`; });
  const g = el('div', 'grid'); g.append(skCards(8));
  view.append(bar, g);
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
  const titles = { hist: 'سجل المشاهدة', likes: 'الإعجابات', favs: 'المحفوظة', mhist: 'السجل السماعي', later: 'شغّل بعدين' };
  const empties = { later: 'القائمة فاضية. من زر ⋮ على أي فيديو اختار «شغّل بعدين»، وبتشتغل ورا بعض لحالها.', hist: 'لسا ما شفت شي.', likes: 'لسا ما عملت إعجاب لأي فيديو. اكبس «إعجاب» تحت أي فيديو.', favs: 'ما في شي محفوظ. اكبس «حفظ» تحت أي فيديو.', mhist: 'لسا ما سمعت شي بـ Nuvio Music.' };
  document.title = `${titles[kind]} — Nuvio`;
  const items = lib.list(kind);
  const head = sectionHead(`${titles[kind]} (${items.length})`);
  if (items.length) {
    const clr = el('button', 'btn', kind === 'hist' || kind === 'mhist' ? 'امسح السجل' : 'امسح الكل');
    clr.onclick = () => { if (confirm('متأكد؟ ما في رجعة.')) { lib.clear(kind); renderLibrary(kind); } };
    head.append(clr);
    if (kind === 'later') {
      const go = el('button', 'btn btn-main', '▶ شغّل الكل');
      go.onclick = () => goNext({ v: items[0], fromQueue: true });
      head.append(go);
    }
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
const SEARCH_TYPE = [['', 'الكل'], ['channel', 'قنوات']];
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
  // نوع النتائج أول شي: «الكل» أو «قنوات» بس
  SEARCH_TYPE.forEach(([val, label]) => {
    const b = el('button', 'f-chip' + ((f.type || '') === val ? ' on' : ''), label);
    b.onclick = () => go(val ? { type: val } : { ...f, type: '' });
    bar.append(b);
  });
  bar.append(el('span', 'f-sep'));
  if (f.type === 'channel') { bar.lastChild.remove(); return bar; }
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
  // فلتر «قنوات»: القنوات بس
  if (f.type === 'channel') {
    const list = el('div', 'ch-strip ch-only'); list.append(skCards(4, true));
    view.replaceChildren(searchFilterBar(q, f), list);
    try {
      const { res } = await cached('scc:' + q, 10 * 60e3, () => withFallback(i => apiFor(i).channels(i.url, q, 40).then(l => { if (!l.length) throw new Error('فاضي'); return l; }), { yti: true }));
      if (!list.isConnected) return;
      list.replaceChildren(...res.map(channelCard));
    } catch { if (list.isConnected) list.replaceWith(el('div', 'empty', 'ما لقيت قنوات بهالاسم.')); }
    return;
  }
  const chWrap = el('div', 'ch-strip in-grid'); // القنوات بتطلع بعد أول 10 فيديوهات (متل يوتيوب)
  const g = el('div', 'grid'); g.append(skCards(8));
  view.replaceChildren(searchFilterBar(q, f), g);
  try {
    const { inst, res } = await cached('s:' + q + JSON.stringify(f), 10 * 60e3, () => withFallback(i => apiFor(i).search(i.url, q, 1, null, f), filtered ? { prefer: 'invidious', yti: true } : { yti: true }));
    if (!g.isConnected) return;
    g.replaceChildren();
    if (!res.items.length) { g.replaceWith(el('div', 'empty', 'ما في نتائج.')); return; }
    if (!filtered) cached('sc:' + q, 10 * 60e3, () => withFallback(i => apiFor(i).channels(i.url, q).then(l => { if (!l.length) throw new Error('فاضي'); return l; }), { yti: true }))
      .then(({ res }) => {
        if (!g.isConnected || !res.length) return;
        res.forEach(ch => chWrap.append(channelCard(ch)));
        const cards = [...g.children].filter(n => n.classList.contains('card') && !n.classList.contains('sk'));
        g.insertBefore(chWrap, cards[10] || null);
      }).catch(() => {});
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
    if (i.type === 'yti') return YtApi.tab(id, tab, sort, cont);
    if (cont && cont.startsWith('yt:')) return Promise.reject(new Error('صفحة من يوتيوب المباشر'));
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
  }, { prefer: 'invidious', yti: true }).then(r => r.res);
  const markShorts = r => (tab === 'shorts' && r && r.items ? { ...r, items: r.items.map(v => ({ ...v, short: true })) } : r);
  return (cont ? run() : cached(`ct:${id}:${tab}:${sort || ''}`, 10 * 60e3, run)).then(markShorts);
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
    // فتت عالقناة: ما عاد في شي جديد فيها
    if (subs.has(id)) chNew.markSeen(id, (res.items && res.items[0] && res.items[0].id) || (chNew.tops()[id] || {}).top);
    if (!head.isConnected) return;
    const { info } = res;
    document.title = `${info.name} — Nuvio`;
    h.textContent = info.name; subsEl.textContent = fmtSubs(info.subs);
    chPreview.set(id, { name: info.name, subs: info.subs });
    if (info.banner) { const b = el('img', 'ch-banner'); b.alt = ''; setImg(b, info.banner); bannerSlot.replaceWith(b); } else bannerSlot.remove();
    const avImg = el('img', 'ch-avatar'); avImg.alt = ''; setImg(avImg, info.avatar); av.replaceWith(avImg);
    fillAvatar(id, info.avatar);
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
      lazyShelf('الأحدث', () => channelTab(id, 'videos', 'newest').then(r => r.items), `#/channel?id=${encodeURIComponent(id)}&tab=videos`, 'spark'),
      lazyShelf('الأكثر مشاهدة', () => channelTab(id, 'videos', 'popular').then(r => r.items), `#/channel?id=${encodeURIComponent(id)}&tab=videos&sort=popular`, 'fire'),
      lazyShelf('الشورتس', () => channelTab(id, 'shorts').then(r => r.items), `#/channel?id=${encodeURIComponent(id)}&tab=shorts`, 'bolt'),
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
  if (url.host.endsWith('.googlevideo.com')) return u; // من جهازك مباشرة: ما في شي نصلّحو
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
      if (r.ok) { try { if (r.body && r.body.cancel) r.body.cancel(); } catch { /* */ } return r.url || u; }
      last = new Error('HTTP ' + r.status);
      if (r.status >= 400 && r.status < 500) break;
    } catch (e) { last = e; } finally { clearTimeout(t); }
  }
  throw last || new Error('ما وصل');
}


/* ================= الطبقة الخفيفة: الفيديو كلّو بأخفض جودة (144p) بالخلفية =================
   مع «تحميل مسبق قوي»: بعد ما يبلّش الفيديو، منحمّل بهدوء نسخة 144p + الصوت لكل الفيديو (بالذاكرة).
   لمّا تقفز لمحل مش محمّل، المشغّل بيبلّش فوراً من هالنسخة (بلا شبكة)، وبعدين بيرجّع الجودة لحالو.
   بتوقف إذا الفيديو الأساسي محتاج الشبكة (المخزون قدّام أقل من 20 ثانية). */
const lowLayer = {
  id: null, track: null, files: new Map(), gen: 0, reqs: new Map(), reqN: 0, done: false,
  MAX: 300e6, CHUNK: 2e6, CACHE: 'nuvio-low-v1', mem: new Map(), // mem: آخر كم قطعة (لحتى القراءة المتتالية تكون أسرع)
  open() { return caches.open(this.CACHE); },
  ck(url, i) { return 'https://nuvio.cache/low/' + encodeURIComponent(url) + '/' + i; },
  stop() { this.gen++; this.id = null; this.track = null; this.done = false; this.files.clear(); this.reqs.clear(); this.mem.clear(); if (self.caches) caches.delete(this.CACHE).catch(() => {}); },
  covers(url, range) {
    const f = this.files.get(url); const m = /bytes=(\d+)-(\d+)/.exec(range || '');
    return !!(f && m && +m[2] < f.got);
  },
  async chunk(url, i) {
    const k = url + '#' + i;
    if (this.mem.has(k)) return this.mem.get(k);
    try {
      const r = await (await this.open()).match(this.ck(url, i));
      if (!r) return null;
      const u8 = new Uint8Array(await r.arrayBuffer());
      this.mem.set(k, u8); if (this.mem.size > 6) this.mem.delete(this.mem.keys().next().value);
      return u8;
    } catch { return null; }
  },
  // بايتات [a..b] من القطع المحفوظة عالجهاز
  async read(url, range) {
    const m = /bytes=(\d+)-(\d+)/.exec(range); const a = +m[1], b = +m[2];
    const out = new Uint8Array(b - a + 1);
    for (let i = Math.floor(a / this.CHUNK); i <= Math.floor(b / this.CHUNK); i++) {
      const c = await this.chunk(url, i); if (!c) return null;
      const base = i * this.CHUNK, s = Math.max(a, base), e = Math.min(b, base + c.length - 1);
      if (e < s) return null;
      out.set(c.subarray(s - base, e - base + 1), s - a);
    }
    return out.buffer;
  },
  // لوين مغطّاية (بالثواني): الأقل بين الصورة والصوت
  coveredTime(dur) {
    if (!dur || !isFinite(dur) || !this.files.size) return 0;
    let t = Infinity;
    for (const f of this.files.values()) t = Math.min(t, f.total ? (f.got / f.total) * dur : 0);
    return t === Infinity ? 0 : t;
  },
  pickTrack(player) {
    const all = player.getVariantTracks().filter(t => t.height && t.originalVideoId);
    const act = all.find(t => t.active);
    // نفس الصوت اللي شغّال هلّق (تبديل نوع الصوت بيقطع الصوت عالآيفون)
    const same = act ? all.filter(t => t.originalAudioId === act.originalAudioId) : all;
    const vs = same.length ? same : all;
    return vs.sort((a, b) => a.height - b.height || a.bandwidth - b.bandwidth)[0] || null;
  },
  async start(player, vid, np) {
    if (this.id === vid && this.files.size) { this.track = this.pickTrack(player) || this.track; return; } // نفس الفيديو (إعادة تحميل): منكمّل
    this.stop();
    const my = this.gen; this.id = vid;
    const low = this.track = this.pickTrack(player);
    if (!low) return;
    const url = key => `${SV}/vp/${vid}/${encodeURIComponent(key)}`;
    const list = [low.originalVideoId, low.originalAudioId].filter(Boolean).map(k => ({ url: url(k), got: 0, total: 0, limit: 0 }));
    list.forEach(f => this.files.set(f.url, f));
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const ahead = () => { const v = np.video; for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime + 0.5 && v.buffered.end(i) > v.currentTime) return v.buffered.end(i) - v.currentTime; return 0; };
    await wait(4000); // الفيديو الأساسي أول
    let c;
    try { c = await this.open(); } catch { return; }
    while (my === this.gen) {
      if (!np.video.isConnected || np.dead) { if (my === this.gen) this.stop(); break; }
      if (document.hidden || (!np.video.paused && (ahead() < Math.min(60, (window.__nuvioGoal || 90) * 0.6) || np.video.readyState < 3))) { await wait(1500); continue; } // الأساسي أهم: بس لمّا المخزون قدّامك شبه مليان
      const todo = list.filter(f => !f.total || f.got < f.limit);
      if (!todo.length) { this.done = true; break; }
      // اللي مغطّي وقت أقل هو اللي منكمّلو (لحتى الصورة والصوت يمشو سوا)
      const f = todo.sort((x, y) => (x.total ? x.got / x.total : -1) - (y.total ? y.got / y.total : -1))[0];
      const end = (f.total ? Math.min(f.limit, f.got + this.CHUNK) : f.got + this.CHUNK) - 1;
      try {
        const r = await fetch(f.url, { headers: { Range: `bytes=${f.got}-${end}` } });
        if (r.status !== 206 && r.status !== 200) { await wait(3000); continue; }
        if (!f.total) {
          const tot = +(((r.headers.get('content-range') || '').split('/')[1]) || 0) || +(r.headers.get('content-length') || 0);
          if (!tot) { await wait(3000); continue; }
          f.total = tot; f.limit = tot;
          // سقف المساحة: الصورة والصوت سوا، بنفس النسبة (يعني بيغطّو نفس الوقت)
          if (list.every(x => x.total)) {
            const sum = list.reduce((s, x) => s + x.total, 0), k = Math.min(1, this.MAX / sum);
            list.forEach(x => { x.limit = Math.floor(x.total * k); });
          }
        }
        const data = new Uint8Array(await r.arrayBuffer());
        if (my !== this.gen) break;
        const n = Math.min(data.length, f.limit - f.got);
        // منحفظ بقطع 2MB (بتبلّش دايماً من أول القطعة)
        await c.put(this.ck(f.url, Math.floor(f.got / this.CHUNK)), new Response(data.subarray(0, n)));
        f.got += n;
        const d = np.video.duration;
        if (np.setLowLayer && d) np.setLowLayer(this.coveredTime(d) / d);
      } catch { await wait(3000); }
    }
  },
};

/* ================= التحميل المتدرّج بالجودة (بعد المخزون الأساسي) =================
   الجودة بتنزل كل ما بعدنا عن مكانك، وبتطلع لحالها كل ما قرّبنا:
     المخزون الأساسي (4 دقايق) بجودتك  →  لحد 8 دقايق: 720p  →  لحد 15: 480p  →  لحد 30: 360p  →  كل الفيديو: 144p (الطبقة الخفيفة)
   كل ما يمشي الفيديو، الشبابيك بتمشي معو: القطع اللي قرّبت بتنحمّل من جديد بجودة أعلى.
   القطع بتنحفظ عالجهاز (مش بالذاكرة)، واللي صار وراك منمسحو. القفز لأي محل بيبلّش فوراً بأحسن جودة محمّلة هونيك. */
const tiers = {
  id: null, gen: 0, idx: new Map(), player: null, CACHE: 'nuvio-tiers-v1',
  plan: [[480, 720], [900, 480], [1800, 360]], // لحد كم ثانية قدّام → أعلى جودة
  key: (url, a, b) => `${url}|${a}-${b}`,
  ck: k => 'https://nuvio.cache/tier/' + encodeURIComponent(k),
  open() { return caches.open(this.CACHE); },
  has(url, range) { const m = /bytes=(\d+)-(\d+)/.exec(range || ''); return !!(m && this.idx.has(this.key(url, +m[1], +m[2]))); },
  async read(url, range) {
    const m = /bytes=(\d+)-(\d+)/.exec(range);
    try { const r = await (await this.open()).match(this.ck(this.key(url, +m[1], +m[2]))); return r ? await r.arrayBuffer() : null; } catch { return null; }
  },
  // أعلى جودة محمّلة عند الثانية t
  bestAt(t) { let best = null; for (const s of this.idx.values()) if (s.h && s.t0 <= t + 0.05 && s.t1 > t + 0.5 && (!best || s.h > best.h)) best = s; return best; },
  // للرسم: لكل جودة، الفترات المحمّلة (كنسب من طول الفيديو)
  ranges(dur) {
    const by = new Map();
    for (const s of this.idx.values()) if (s.h) { if (!by.has(s.h)) by.set(s.h, []); by.get(s.h).push([s.t0, s.t1]); }
    const out = [];
    for (const [h, list] of by) {
      list.sort((a, b) => a[0] - b[0]);
      let cur = null;
      for (const [a, b] of list) { if (cur && a <= cur[1] + 0.5) cur[1] = Math.max(cur[1], b); else { if (cur) out.push({ h, from: cur[0] / dur, to: cur[1] / dur }); cur = [a, b]; } }
      if (cur) out.push({ h, from: cur[0] / dur, to: cur[1] / dur });
    }
    return out;
  },
  async evict(t) { // اللي صار وراك بأكتر من دقيقة ونص منمسحو
    const old = [...this.idx].filter(([, s]) => s.h && s.t1 < t - 90);
    if (!old.length) return;
    const c = await this.open().catch(() => null);
    for (const [k] of old) { this.idx.delete(k); if (c) c.delete(this.ck(k)).catch(() => {}); }
  },
  stop() { this.gen++; this.id = null; this.player = null; this.idx.clear(); if (self.caches) caches.delete(this.CACHE).catch(() => {}); },
  async start(player, vid, np) {
    if (this.id === vid) { this.player = player; return; }
    this.stop();
    const my = this.gen; this.id = vid; this.player = player;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const ahead = () => { const v = np.video; for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime + 0.5 && v.buffered.end(i) > v.currentTime) return v.buffered.end(i) - v.currentTime; return 0; };
    const refs = new Map();
    const refsOf = async st => {
      if (refs.has(st)) return refs.get(st);
      await st.createSegmentIndex();
      const out = []; for (const r of st.segmentIndex) out.push(r);
      refs.set(st, out); return out;
    };
    // بداية كل ملف (Initialization) من ملف DASH تبعنا — المشغّل بيطلبها لمّا يبدّل جودة
    const inits = new Map();
    try {
      const mf = await manifestText(ownMpd(vid));
      for (const m of mf.text.matchAll(/<Representation id="([^"]+)"[\s\S]*?<Initialization range="(\d+)-(\d+)"/g)) inits.set(m[1], [+m[2], +m[3]]);
    } catch { /* */ }
    await wait(6000);
    while (my === this.gen) {
      if (!np.video.isConnected || np.dead) { if (my === this.gen) this.stop(); break; }
      const v = np.video, dur = v.duration;
      if (document.hidden || !isFinite(dur) || (!v.paused && (ahead() < Math.min(60, (window.__nuvioGoal || 90) * 0.6) || v.readyState < 3))) { await wait(1500); continue; } // الأساسي أهم
      if (lowLayer.id === vid && lowLayer.files.size && !lowLayer.done) { await wait(2000); continue; } // الخفيفة أول (تغطية كل الفيديو)
      let job = null;
      try {
        const sp = this.player;
        // السقف: أعلى جودة بتناسب الشاشة (مش الجودة الحالية — ممكن تكون مؤقتاً خفيفة بعد قفزة)
        const capH = Math.max(0, ...(sp ? sp.getVariantTracks().map(x => x.height || 0) : [0]));
        if (Date.now() - (this.lastEvict || 0) > 15000) { this.lastEvict = Date.now(); await this.evict(v.currentTime); }
        if (this._listFor !== sp) { // منقرا ملف الفيديو من المشغّل مرة وحدة بس
          const vids = new Map();
          for (const va of (sp && sp.getManifest() ? sp.getManifest().variants : [])) if (va.video && /avc1/.test(va.video.codecs || '')) vids.set(va.video.originalId, va.video);
          this._list = [...vids.values()].sort((a, b) => b.height - a.height); this._listFor = sp;
        }
        const list = this._list || [];
        const t = v.currentTime;
        let from = t + ahead();
        for (const [until, maxH] of this.plan) {
          const to = Math.min(dur, t + until);
          if (from < to) {
            const st = list.find(s => s.height <= Math.min(maxH, capH || maxH) && s.height > 144);
            if (st) {
              for (const ref of await refsOf(st)) {
                if (ref.endTime <= from || ref.startTime >= to || ref.getEndByte() == null) continue;
                const best = this.bestAt(ref.startTime + 0.1);
                if (best && best.h >= st.height) continue; // عندي نفسها أو أحسن
                job = { st, ref }; break;
              }
            }
          }
          if (job) break;
          from = Math.max(from, to);
        }
        if (!job) { await this.evict(t); await wait(4000); continue; }
        // القطعة (ومعها بداية الملف تبع هالجودة إذا مش محمّلة)
        const items = [];
        const su = job.ref.getUris()[0], ir = inits.get(job.st.originalId);
        if (ir && !this.idx.has(this.key(su, ir[0], ir[1]))) items.push({ url: su, a: ir[0], b: ir[1], init: true });
        items.push({ url: su, a: job.ref.getStartByte(), b: job.ref.getEndByte(), t0: job.ref.startTime, t1: job.ref.endTime });
        const c = await this.open();
        for (const it of items) {
          const r = await fetch(it.url, { headers: { Range: `bytes=${it.a}-${it.b}` } });
          if (r.status !== 206 && r.status !== 200) throw new Error('HTTP ' + r.status);
          const buf = await r.arrayBuffer();
          if (my !== this.gen) break;
          const k = this.key(it.url, it.a, it.b);
          await c.put(this.ck(k), new Response(buf));
          this.idx.set(k, it.init ? { h: 0, t0: -1, t1: -1 } : { h: job.st.height, rep: job.st.originalId, t0: it.t0, t1: it.t1 });
        }
        if (np.setTiers) np.setTiers(this.ranges(dur));
      } catch { await wait(3000); }
    }
  },
};

function regLowScheme() {
  if (!window.shaka || window.__nuvioLowScheme) return;
  window.__nuvioLowScheme = true;
  shaka.net.NetworkingEngine.registerScheme('nuviocache', uri => {
    const k = +String(uri).split('//')[1];
    const q = lowLayer.reqs.get(k);
    if (q && q.data) return shaka.util.AbortableOperation.completed({ uri: q.url, originalUri: q.url, data: q.data, headers: { 'content-type': 'video/mp4' }, status: 206, timeMs: 1, fromCache: true });
    // ما لقيناها (إعادة محاولة بعد ما انمسحت؟): من الشبكة عادي بدل خطأ
    const ctl = new AbortController();
    const p = q ? fetch(q.url, { headers: { Range: q.range }, signal: ctl.signal }).then(async r => {
      if (!r.ok) throw new shaka.util.Error(2, 1, 1001, q.url, r.status);
      return { uri: q.url, originalUri: q.url, data: await r.arrayBuffer(), headers: {}, status: r.status, timeMs: 1 };
    }) : Promise.reject(new shaka.util.Error(2, 1, 1001, String(uri), 0));
    return new shaka.util.AbortableOperation(p, () => { ctl.abort(); return Promise.resolve(); });
  });
}

/* ملف DASH بينجاب مرة وحدة وبينحفظ دقايق: المشغّل والصوت بالخلفية والتحميل المسبق كلهن بيستعملوه */
function manifestText(url) {
  return cached('mf:' + url, 4 * 60e3, async () => {
    let last;
    const isComp = url.startsWith(COMP), isOwn = url.startsWith(SV);
    const tries = isComp ? 1 : isOwn ? 2 : 6; // مصادرنا: إذا ما زبطت، منروح ليوتيوب فوراً بدل ما نستنّى
    for (let i = 0; i < tries; i++) {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), isComp ? 6000 : isOwn ? 5000 : 7000);
      try {
        const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
        if (r.ok) { const text = await r.text(); if (text.includes('<MPD')) return { text: absMpd(text, r.url || url), final: r.url || url }; last = new Error('مش DASH'); }
        else { last = new Error('HTTP ' + r.status); if (r.status >= 400 && r.status < 500) break; }
      } catch (e) { last = e; } finally { clearTimeout(tm); }
    }
    throw last || new Error('ما وصل');
  });
}
const toDataUri = (text, mime) => `data:${mime};base64,` + btoa(unescape(encodeURIComponent(text)));

/* رابط صوت مباشر للتشغيل بالخلفية: منطلّعو من ملف DASH (مسموح CORS وبيوصل لسيرفر سليم) */
async function bgAudioUrl(res) {
  const dash = res.sources.find(s => s.kind === 'dash');
  if (!dash) return res.audio || '';
  const { text: xml, final } = await manifestText(dash.url);
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

let ytOnceOff = ''; // «شغّل بمشغّلنا» لمرة وحدة لمّا يوتيوب ما يشتغل
async function renderWatch(id, startTime) {
  const seq = routeSeq;
  // كمّل من وين وقفت (إذا ما في وقت محدّد بالرابط)
  const resumed = !startTime ? resumeAt(id) : 0;
  if (resumed) startTime = resumed;
  await destroyPlayer();
  // إذا تركت الصفحة قبل ما تجهز (رجعت للرئيسية أو صغّرت)، ما منرسم الفيديو فوقها
  const [hp, hq] = (location.hash.slice(1) || '/').split('?');
  if (seq !== routeSeq || hp !== '/watch' || new URLSearchParams(hq || '').get('v') !== id) return;
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
  if (typeof commentsSection === 'function' && !tvOn()) main.append(commentsSection(id));
  floatOnScroll(box);
  const ytInfo = ytiUsable() ? YtApi.watch(id).catch(() => null) : null;
  let shown = null; // المعلومات اللي انعرضت (من يوتيوب المباشر أو من السيرفر العام، اللي بيوصل أول)
  active = { id, box, layout, main, title: () => (current && current.data.title) || (shown && shown.title) || (pv && pv.title) || '', author: () => (current && current.data.author) || (shown && shown.author) || (pv && pv.author) || '', np: () => np };
  enableSwipeDown(box);

  const setChip = () => {};

  const music = isMusic();
  const artistOf = () => ({ id: (current && current.data.authorId) || (shown && shown.authorId) || (pv && pv.authorId), name: (current && current.data.author) || (shown && shown.author) || (pv && pv.author), avatar: (current && current.data.avatar) || (shown && shown.avatar) });
  let np = new NuvioPlayer(box, {
    onStall: t => recover(t), onError: t => recover(t),
    onOther: () => openCastSheet({ id, title: (shown && shown.title) || (pv && pv.title) || document.title.replace(/ — Nuvio$/, ''), t: np && np.video ? np.video.currentTime : 0 }),
    copyIcon: music ? 'plus' : 'copy',
    onCopy: music ? () => toggleArtist(artistOf()) : () => {
      const u = `https://youtu.be/${id}`;
      (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => note('انسخ الرابط ✓'), () => note(u));
    },
  });
  np.video.poster = ytThumb(id, 'hqdefault');
  if (np.setLowLayer) np.setLowLayer(lowLayer.id === id ? lowLayer.coveredTime(1) : 0);
  // القفز لمحل مش محمّل: منبلّش فوراً بأحسن جودة محمّلة هونيك (720/480/360، وإلا 144p)، وبعد ثانية منرجع لجودتك
  let lowBack = 0, lowHome = null, lowAbr = true, lowWait = false;
  np.video.addEventListener('seeking', () => {
    const v = np.video, t = v.currentTime, sp = player;
    if (!sp || !(window.YtMedia && !(v instanceof YtMedia))) return;
    for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= t && v.buffered.end(i) > t + 1) return; // محمّل أصلاً بالجودة العالية
    try {
      const cur = sp.getVariantTracks().find(x => x.active);
      if (!cur) return;
      const home = lowHome || cur; // جودتك الأصلية (حتى لو قفزت كذا مرة ورا بعض)
      const tb = tiers.id === id ? tiers.bestAt(t) : null;
      let pick = null;
      if (tb) {
        if (tb.rep === home.originalVideoId && cur.id === home.id) return; // جودتك نفسها محمّلة: بتنخدم من الجهاز لحالها
        pick = sp.getVariantTracks().find(x => x.originalVideoId === tb.rep && x.originalAudioId === home.originalAudioId);
      }
      if (!pick && lowLayer.track && lowLayer.id === id && t < lowLayer.coveredTime(v.duration) - 5) pick = sp.getVariantTracks().find(x => x.id === lowLayer.track.id) || lowLayer.track;
      if (!pick || cur.id === pick.id) return;
      if (!lowHome) { lowHome = cur; lowAbr = sp.getConfiguration().abr.enabled; }
      sp.configure({ abr: { enabled: false } });
      sp.selectVariantTrack(pick, false);
      clearTimeout(lowBack);
      if (lowWait) return;
      lowWait = true;
      v.addEventListener('playing', () => {
        lowWait = false;
        clearTimeout(lowBack);
        lowBack = setTimeout(() => {
          const back = lowHome; lowHome = null;
          if (player !== sp || !back) return;
          try { sp.selectVariantTrack(back, true, 2); if (lowAbr) sp.configure({ abr: { enabled: true } }); } catch { /* */ }
        }, 1000);
      }, { once: true });
    } catch { /* */ }
  });
  if (svUsable() && !extUsable()) np.setBgAudio(`${SV}/vp/${encodeURIComponent(id)}/140`); // مع الإضافة: الصوت من جهازك (extExtras)
  window.__nuvioNp = np;
  box.classList.add('loading');

  /* ---- قياس جودة التشغيل (بلا بيانات شخصية): وقت البداية، الوقفات، القفزات، المصدر → لوحة التحكّم ---- */
  const qoe = (() => {
    const T0 = performance.now();
    let v = np.video;
    const s = { startMs: 0, stalls: 0, stallMs: 0, seeks: 0, seekMs: 0, watched: 0, h: 0, errs: 0, seekStuck: 0 };
    let waitAt = 0, seekAt = 0, lastT = null, reported = false, lastFlush = T0, seekWd = 0, gen = 0;
    const diag = m => { try { navigator.sendBeacon('https://tube.glanzstar.de/acc/err', JSON.stringify({ m, s: 'app.js', l: 0, v: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '', ua: navigator.userAgent.slice(0, 180), p: '/watch' })); } catch { /* */ } };
    const bufStr = m => { try { const b = m.buffered, out = []; for (let i = 0; i < b.length && i < 4; i++) out.push(Math.round(b.start(i)) + '-' + Math.round(b.end(i))); return out.join(',') || '∅'; } catch { return '?'; } };
    // بينربط بالمشغّل الحالي (وبمشغّل يوتيوب إذا انتقلنا لإلو)
    const attach = media => {
      const my = ++gen; v = media; lastT = null; seekAt = 0; waitAt = 0; clearTimeout(seekWd);
      const on = (n, f) => media.addEventListener(n, e => { if (my === gen) f(e); });
      on('seeking', () => {
        seekAt = performance.now(); waitAt = 0; s.seeks++;
        // قفزة علقت أكتر من 8 ثواني: منبعت تقرير مفصّل، ومنعيد تحميل المصدر من نفس الثانية
        clearTimeout(seekWd);
        const target = media.currentTime;
        seekWd = setTimeout(() => {
          if (my !== gen || !box.isConnected || !seekAt) return;
          s.seekStuck++;
          diag(`seek stuck 8s src=${srcName()} t=${Math.round(target)}/${Math.round(media.duration || 0)} rs=${media.readyState} ns=${media.networkState} paused=${media.paused} buf=${bufStr(media)}`);
          if (!embedOn && !(window.YtMedia && media instanceof YtMedia)) recover(target);
        }, 8000);
      });
      on('seeked', () => { if (seekAt && (media.paused || media.readyState >= 3)) { if (!media.paused) s.seekMs += performance.now() - seekAt; seekAt = 0; clearTimeout(seekWd); } });
      on('waiting', () => { if (!media.seeking && !seekAt && s.startMs) waitAt = performance.now(); });
      on('playing', () => {
        const t = performance.now();
        if (!s.startMs) s.startMs = Math.round(t - T0);
        if (seekAt) { s.seekMs += t - seekAt; seekAt = 0; }
        clearTimeout(seekWd);
        if (waitAt) { const d = t - waitAt; if (d > 250) { s.stalls++; s.stallMs += d; } waitAt = 0; }
      });
      on('timeupdate', () => {
        const t = media.currentTime;
        if (lastT != null && !media.paused && !media.seeking) { const d = t - lastT; if (d > 0 && d < 2) s.watched += d / (media.playbackRate || 1); }
        lastT = t; if (media.videoHeight > s.h) s.h = media.videoHeight;
      });
    };
    attach(v);
    const srcName = () => {
      if (box.querySelector('iframe')) return 'embed';
      const c = srcList[srcIdx];
      if (!c) return 'other';
      if (c.kind === 'ext') return document.documentElement.hasAttribute('data-nuvio-app') ? 'app' : 'ext'; // تطبيق الأندرويد أو إضافة المتصفح
      if (c.url.startsWith(SV)) return c.kind === 'mp4' ? 'mp4' : 'own';
      if (c.url.startsWith(COMP)) return 'comp';
      return curInst && curInst.type === 'piped' ? 'piped' : 'inv';
    };
    const flush = () => {
      const t = performance.now();
      lastFlush = t;
      if (waitAt) { const d = t - waitAt; if (d > 250) { s.stalls++; s.stallMs += d; } waitAt = t; }
      const failed = !s.startMs && t - T0 > 6000 ? 1 : 0; // طلع قبل ما يبلّش بأقل من 6 ثواني: مش فشل
      if (!s.watched && !s.stalls && !failed) return;
      const r = { src: srcName(), part: reported ? 1 : 0, failed: reported ? 0 : failed, startMs: reported ? 0 : s.startMs, stalls: s.stalls, stallMs: Math.round(s.stallMs), seeks: s.seeks, seekMs: Math.round(s.seekMs), seekStuck: s.seekStuck, watched: Math.round(s.watched), h: s.h, errs: s.errs, mobile: matchMedia('(pointer: coarse)').matches ? 1 : 0 };
      reported = true;
      Object.assign(s, { stalls: 0, stallMs: 0, seeks: 0, seekMs: 0, watched: 0, errs: 0, seekStuck: 0 });
      try { navigator.sendBeacon(`${typeof ACC === 'string' ? ACC : 'https://tube.glanzstar.de/acc'}/qoe`, JSON.stringify(r)); } catch { /* */ }
    };
    const onVis = () => { if (document.hidden) flush(); };
    document.addEventListener('visibilitychange', onVis);
    const iv = setInterval(() => {
      if (!box.isConnected) { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); flush(); return; }
      if (performance.now() - lastFlush > 300e3) flush(); // الجلسات الطويلة بتوصل للوحة كل 5 دقايق
    }, 3000);
    return { err: () => { s.errs++; }, attach };
  })();

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
  // فتحت رابط مباشر وما منعرف العنوان؟ منجيبو من يوتيوب نفسو (~0.1 ثانية) لحد ما توصل باقي المعلومات
  if (!pv || !pv.title) ytOembed(id).then(o => {
    if (!o || current || !h1.isConnected) return;
    h1.textContent = o.title; h1.dataset.oe = '1';
    document.title = `${o.title} — Nuvio`;
    if (o.author && !(pv && pv.author)) metaRow.replaceChildren(el('span', 'author', o.author), el('span', 'sk sk-line short'));
  }).catch(() => {});
  const sideList = el('div', 'related-list'); sideList.append(skCards(8, true));
  side.append(el('h2', 'section-title', 'فيديوهات مشابهة'), sideList);
  let relShown = false;
  const fillRelated = list0 => {
    if (relShown || !list0 || !list0.length) return;
    // «مش مهتم» دايماً بينشال؛ واللي شفتو بينشال من المقترحات إذا الخيار شغّال (مش بالموسيقى)
    let list = list0.filter(v => wanted(v) && (music || !prefs.get('hideWatched') || !isWatched(v.id)));
    if (list.length < 4) list = list0.filter(wanted);
    relShown = true;
    sideList.replaceChildren();
    const seen = new Set([id]);
    list.forEach(v => { if (!seen.has(v.id)) { seen.add(v.id); sideList.append(card(v, { row: true })); } });
    const feed = relatedFeed(list.map(v => v.id), seen);
    infinite(sideList, async () => { const more = await feed(); more.forEach(v => sideList.append(card(v, { row: true }))); return more.length > 0; }, { row: true });
  };
  if (ytiUsable()) relatedOf(id).then(fillRelated).catch(() => {});
  view.replaceChildren(layout);
  if (openInMini) { openInMini = false; requestAnimationFrame(() => minimize()); } // الجاي بيكمّل بالمشغّل الصغير
  if (resumed) setTimeout(() => note(`كمّلنا من ${fmtT(resumed)} — وين وقفت`), 900);
  let extras = watchExtras({ id, getNp: () => np, box, music, related: () => (shown && shown.related) || (current && current.data.related) || [] });
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
    note(opened ? 'اختار الشاشة' : 'جاهز — اكبس زر الشاشة بالمشغّل لتختار التلفزيون');
  }, [
    { ico: 'tvout', label: 'شغّل على جهاز تاني', fn: () => np && np.opts.onOther && np.opts.onOther() },
    ...(music ? [{ ico: 'star', label: 'ضيف المطرب للمفضّلين', fn: () => toggleArtist(artistOf()) }] : []),
  ]));
  if (pv) document.title = `${pv.title} — Nuvio`;

  /* ---- مشغّل يوتيوب الاحتياطي (بس إذا مصادرنا ما زبطت) ----
     بيبلّش بلا صوت ومغطّى بالصورة، ومنتأكد إنو الفيديو نفسو هو اللي عم يمشي مش إعلان:
     نفس رقم الفيديو + نفس المدة + الوقت عم يتقدّم من النقطة الصح. إذا لا (إعلان أو علّق)،
     منعيد تحميلو فوراً من نفس الثانية — لحد 4 مرات بالبداية و3 بالنص. لمّا يتأكّد منكشفو ومنرجّع الصوت. */
  let embedOn = false;
  /* ---- مشغّل يوتيوب الاحتياطي بواجهتنا (بس إذا مصادرنا ما زبطت) ----
     التشغيل من يوتيوب على جهازك، بس كل الأزرار والشكل تبعنا، وبلا كلمة يوتيوب ولا شعارو.
     منتأكد إنو الفيديو نفسو هو اللي عم يمشي (نفس الرقم + نفس المدة + الوقت عم يتقدّم)؛
     إذا لا (إعلان أو علّق) منعيد تحميلو فوراً من نفس الثانية — لحد 4 مرات بالبداية و3 بالنص. */
  function embed(at) {
    if (embedOn || !window.YtMedia) return;
    embedOn = true;
    destroyPlayer();
    const prev = np;
    const media = new YtMedia(id);
    const cover = el('div', 'emb-cover');
    const img = el('img'); img.alt = ''; img.src = ytThumb(id, 'hqdefault');
    const msg = el('div', 'emb-msg', '');
    cover.append(img, msg);
    media.el.append(cover);
    if (prev) { try { prev.video.pause(); } catch { /* */ } prev.destroy(); }
    box.classList.remove('ui', 'paused', 'loading');
    box.classList.add('emb');
    const opts = { ...(prev ? prev.opts : {}), media, onStall: t => reloadAt(t, 'stall'), onError: t => reloadAt(t, 'error') };
    delete opts.onNext;
    np = new NuvioPlayer(box, opts);
    window.__nuvioNp = np;
    np.video.poster = ytThumb(id, 'hqdefault');
    qoe.attach(np.video);
    if (svUsable() && !extUsable()) np.setBgAudio(`${SV}/vp/${encodeURIComponent(id)}/140`);
    setChip('مشغّل احتياطي', 'warn');
    // كل شي مربوط بالمشغّل (حفظ المكان، تخطّي الدعايات جوّا الفيديو، الجاي…)
    const ex = extras = watchExtras({ id, getNp: () => np, box, music, related: () => (shown && shown.related) || (current && current.data.related) || [] });
    if (shown) {
      np.opts.onNext = () => goNext(pickNext(id, shown.related, music, true));
      np.setMeta({ title: shown.title, artist: shown.author, art: ytThumb(id, 'hqdefault') });
      if (ex.chapters) ex.chapters(shown.description || '');
    }
    const want = +(pv && pv.duration) || 0;
    let tries = 0, mids = 0, goodCt = 0, dur = want, failed = false, waitUser = false, adSince = 0;
    const reloadAt = (t, why) => {
      if (failed || !box.isConnected) return;
      if (why && mids >= 3) return;
      if (why) mids++;
      tries = 0; adSince = 0;
      cover.hidden = false; msg.textContent = why === 'ad' ? 'عم شيل الإعلان…' : '';
      media.hide(); tries++; media.load(t);
    };
    // انتقل المشغّل لمحل تاني بالصفحة (المشغّل الصغير) وإطار يوتيوب انعاد تحميلو: منكمّل من نفس الثانية
    box._ytResume = () => { if (!failed && np && np.video === media) reloadAt(media.currentTime || goodCt); };
    const fail = () => {
      if (failed || !box.isConnected) return;
      failed = true; stop();
      msg.textContent = 'هالفيديو ما عم يشتغل هلّق 😕';
      cover.querySelector('.emb-spin')?.remove();
      const b = el('button', 'btn btn-main', 'جرّب كمان مرة'); b.onclick = e => { e.stopPropagation(); renderWatch(id, goodCt || at || 0); };
      cover.append(b);
      if (prefs.get('player') === 'yt') { const o = el('button', 'btn', 'شغّل بمشغّلنا'); o.onclick = e => { e.stopPropagation(); ytOnceOff = id; renderWatch(id, goodCt || at || 0); }; cover.append(o); }
      cover.hidden = false;
    };
    media.addEventListener('yterror', () => { if (tries < 2) { tries++; media.load(goodCt || at); } else fail(); });
    // إعلان؟ (فيديو تاني، أو مدّتو غير مدّة الفيديو). على الآيفون أحياناً ما بيوصل رقم الفيديو، فالمدّة بتكفّي
    const adLike = () => !!((media.vid && media.vid !== id) || (dur && media.curDur && Math.abs(media.curDur - dur) > 3));
    // الفيديو الحقيقي عم يمشي؟
    const isContent = () => {
      if (!dur && media.dur) dur = media.dur;
      // لازم يكون وصلنا وقت من يوتيوب نفسو (ct0) والفيديو عم يمشي فعلاً — مش بس الثانية اللي طلبناها
      return !adLike() && media.ct0 >= 0 && media.st === 1 && media.ct >= media.t0 - 1.5 && media.ct - Math.max(media.ct0, media.t0 - 1.5) > 0.6;
    };
    const showAd = now => {
      if (!adSince) { adSince = now; media.cmd('mute'); }
      const left = media.curDur > 0 ? Math.max(0, Math.ceil(media.curDur - media.ct)) : 0;
      msg.textContent = left ? `إعلان من يوتيوب ما قدرنا نشيلو — بيخلص بعد ${left} ث` : 'إعلان من يوتيوب — ثواني وبيخلص…';
    };
    const iv = setInterval(() => {
      if (!box.isConnected || np === null || np.dead) { stop(); return; }
      const now = Date.now();
      if (document.hidden) { media.loadAt = now; media.ctMoveAt = now; return; } // بالخلفية الرسايل بتبطى: ما منحكم
      if (!media.revealed) {
        if (isContent()) { waitUser = false; adSince = 0; msg.textContent = ''; goodCt = media.ct; cover.hidden = true; media.reveal(); return; }
        if (waitUser || !media.wantPlay) return; // ناطرين كبسة «تشغيل» منك
        if (now - media.loadAt > 3500) {
          const started = media.st === 1 || media.st === 3 || media.ct > media.t0 + 0.3;
          if (!started) { // ما بلّش أبداً (الموبايل منع التشغيل): صورتنا بتضل فوق وزر التشغيل تبعنا بيبيّن
            waitUser = true; msg.textContent = ''; media.wantPlay = false; media._emit('pause'); return;
          }
          if (adLike()) {
            // إعلان: مرة وحدة منعيد (أحياناً بيروح). إذا رجع، منستنّاه يخلص تحت الصورة بلا صوت ومع عدّاد — بلا لفّ
            if (tries < 2) { msg.textContent = 'عم شيل الإعلان…'; tries++; media.load(media.t0); return; }
            showAd(now);
            if (now - adSince > 150e3) { goodCt = media.ct; cover.hidden = true; media.reveal(); } // ما منعلق للأبد
            return;
          }
          // مش إعلان، بس لسّا عم يحمّل (نت بطيء): منستنّى بلا ما نعيد. إذا وقف كتير، منعيد مرة
          if (now - Math.max(media.loadAt, media.ctMoveAt || 0) > 12000) {
            if (tries < 3) { tries++; media.load(media.ct > media.t0 ? media.ct : media.t0); }
            else { goodCt = media.ct; cover.hidden = true; media.reveal(); }
          }
        }
        return;
      }
      const sinceSeek = now - (media.lastSeekAt || 0);
      const frozen = media.st === 1 && now - media.ctMoveAt > 6000 && sinceSeek > 10000 && media.seekingTo == null;
      if (adLike()) {
        // إعلان بالنص: مرة منرجع لنفس الثانية (غالباً بيتخطّاه)، وإذا رجع منستنّاه مخبّى
        if (mids < 1) { reloadAt(goodCt, 'ad'); return; }
        media.hide(); cover.hidden = false; tries = 9; showAd(now); // tries=9: ما في إعادة تحميل، بس انتظار
        return;
      }
      if (frozen) { reloadAt(goodCt, 'stall'); return; }
      if (media.st === 1) goodCt = media.ct;
    }, 400);
    function stop() { clearInterval(iv); }
    tries = 1;
    media.load(at);
  }

  let srcList = [], srcIdx = 0, curInst = null, reloads = 0, secondRound = false, goodSince = 0;

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
      regLowScheme();
      player.getNetworkingEngine().registerRequestFilter(async (type, req) => {
        req.uris = await Promise.all(req.uris.map(fixUrl));
        // محمّل من قبل بالطبقة الخفيفة؟ من الذاكرة فوراً بلا شبكة
        const rg = req.headers && (req.headers.Range || req.headers.range);
        let data = null;
        if (rg && lowLayer.covers(req.uris[0], rg)) data = await lowLayer.read(req.uris[0], rg);
        else if (rg && tiers.has(req.uris[0], rg)) data = await tiers.read(req.uris[0], rg);
        if (data) {
          const k = ++lowLayer.reqN;
          lowLayer.reqs.set(k, { url: req.uris[0], range: rg, data });
          if (lowLayer.reqs.size > 40) lowLayer.reqs.delete(lowLayer.reqs.keys().next().value); // منخلّي آخر 40 بس (لإعادة المحاولة)
          req.uris = ['nuviocache://' + k];
        }
      });
      const strong = !!(window.nuvioStrong && nuvioStrong());
      player.configure({
        preferredVideoCodecs: ['avc1', 'vp9'],
        streaming: {
          // مخزون أكبر + طلب القطع الجاية سلفاً: أي بطء قصير عالشبكة ما بيبيّن (عالواي فاي: 4 دقايق قدّام)
          bufferingGoal: 90, rebufferingGoal: 2, bufferBehind: 30, segmentPrefetchLimit: 2,
          retryParameters: { maxAttempts: 5, baseDelay: 300, backoffFactor: 1.5, timeout: 15000, stallTimeout: 6000, connectionTimeout: 8000 },
          stallEnabled: true, stallThreshold: 1, stallSkip: 0.1,
          ignoreTextStreamFailures: true,
        },
        manifest: { retryParameters: { maxAttempts: 3, baseDelay: 400, timeout: 12000 }, dash: { ignoreMinBufferTime: true } },
        // بداية سريعة، والجودة بتطلع لحالها — بس مش أعلى من الشاشة (4K عالتلفون بيقطّش وما إلو داعي)
        abr: { enabled: true, defaultBandwidthEstimate: 1.6e6, switchInterval: 4, bandwidthUpgradeTarget: 0.7, restrictToScreenSize: true },
      });
      player.configure(saverCfg()); // توفير الإنترنت: لحد 480p
      const me = player;
      player.addEventListener('error', ev => {
        console.warn('[nuvio] shaka', ev.detail);
        try {
          const d = ev.detail || {}, dt = d.data || [];
          const u = typeof dt[0] === 'string' ? dt[0].replace(/^https?:\/\/[^/]+/, '').split('?')[0].slice(0, 60) : '';
          navigator.sendBeacon('https://tube.glanzstar.de/acc/err', JSON.stringify({ m: `shaka ${d.code} sev${d.severity} ${typeof dt[1] === 'number' ? 'http' + dt[1] : ''} ${u} src=${(s.url || '').replace(/^https?:\/\/[^/]+/, '').split('/').slice(0, 3).join('/')} t=${Math.round(np && np.video ? np.video.currentTime : 0)}`, s: 'app.js', l: 0, v: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '', ua: navigator.userAgent.slice(0, 180), p: '/watch' }));
        } catch { /* */ }
        if (player === me && ev.detail && ev.detail.severity === 2) recover(np.video.currentTime);
      });
      // ملف DASH من الذاكرة (أو بينجاب مرة وحدة) — بلا طلب تاني. «ext»: من جهازك (إذا فشل، المصدر اللي بعدو)
      const mf = s.kind === 'ext' ? await extManifest(s.id) : s.kind === 'dash' ? await manifestText(s.url).catch(() => null) : null;
      if (mf) await player.load(toDataUri(mf.text, 'application/dash+xml'), startAt || null, 'application/dash+xml');
      else await player.load(await resolveUrl(s.url), startAt || null);
      np.setShaka(player);
      np.applySavedQuality();
      // المخزون قدّام بالحجم مش بالوقت: المتصفح (والآيفون أكتر) بيرفض أكتر من ~150MB بذاكرة التشغيل وبيعلق.
      // ~70MB قدّام: 1080p ≈ دقيقتين، 720p ≈ 4 دقايق. الباقي على التحميل المتدرّج (عالجهاز، مش بذاكرة التشغيل)
      const tuneBuf = () => {
        if (player !== me) return;
        const a = player.getVariantTracks().find(x => x.active);
        const bw = a && (a.videoBandwidth || a.bandwidth);
        if (!bw) return;
        const goal = Math.max(45, Math.min(strong ? 240 : 90, Math.floor((strong ? 70e6 : 50e6) * 8 / bw)));
        player.configure({ streaming: { bufferingGoal: goal, bufferBehind: Math.min(30, Math.floor(goal / 3)) } });
        window.__nuvioGoal = goal;
      };
      tuneBuf();
      player.addEventListener('adaptation', tuneBuf);
      player.addEventListener('variantchanged', tuneBuf);
      // الطبقة الخفيفة (144p لكل الفيديو) — بس من مصدرنا ومع «تحميل مسبق قوي»
      // (النسخة الخفيفة لكل الفيديو + الجودات بالخلفية انلغو: كانو يضغطو سيرفرنا ويخلّو يوتيوب يحظرو)
    }
  }

  async function playSources(inst, sources, startAt) {
    curInst = inst; srcList = sources;
    if (!np) return false;
    for (srcIdx = 0; srcIdx < srcList.length; srcIdx++) {
      try {
        await loadSource(srcList[srcIdx], startAt);
        goodSince = Date.now();
        setChip('بلا إعلانات ✓', 'ok');
        np.autoplay(); // إذا المتصفح منع الصوت: بلا صوت + زر «اكبس لتشغيل الصوت»
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
    qoe.err();
    try {
      if (goodSince && Date.now() - goodSince > 60e3) reloads = 0; // كان ماشي منيح من دقيقة: مش مشكلة دايمة
      reloads++;
      const cur = srcList[srcIdx];
      if (reloads <= (cur && cur.url && cur.url.startsWith(COMP) ? 1 : 3) && cur) {
        if (cur.kind === 'dash') memo.delete('mf:' + cur.url); // ملف جديد بروابط جديدة
        if (cur.kind === 'ext') memo.delete('xmf:' + cur.id);
        try { await loadSource(cur, t); np.autoplay(); goodSince = Date.now(); return; } catch { /* المصدر اللي بعدو */ }
      }
      // مصدر تاني من نفس القائمة (مثلاً من الـ companion لمصدرنا القديم) قبل السيرفرات العامة
      for (let k = srcIdx + 1; k < srcList.length; k++) {
        try { await loadSource(srcList[k], t); srcIdx = k; reloads = 0; np.autoplay(); goodSince = Date.now(); return; } catch { /* */ }
      }
      reloads = 0;
      if (curInst) mark(curInst.url, false);
      await tryNext(t);
    } finally { recovering = false; }
  }

  // من مصدرنا: الترجمة والصوت بالخلفية من خدمتنا، والمعلومات من يوتيوب المباشر (أو السيرفر العام إذا لزم)
  const infoFromPublic = () => getVideo(id).then(({ inst, res }) => {
    if (!box.isConnected) return;
    fillInfo(res); if (!current) current = { inst, data: res };
    if (np && !(np.captions && np.captions.length)) np.setCaptions(res.captions || []);
  }).catch(() => {});
  function ownExtras() {
    setChip('بلا إعلانات ✓', 'ok');
    fetch(`${SV}/info/${id}`).then(r => (r.ok ? r.json() : null)).then(j => {
      if (!j || !np) return;
      if (j.captions && j.captions.length) np.setCaptions(j.captions);
      np.setBgAudio(j.audio || `${SV}/vp/${encodeURIComponent(id)}/140`);
    }).catch(() => {});
    if (ytInfo) ytInfo.then(d => { if (!d) infoFromPublic(); }); else infoFromPublic();
  }
  // من جهازك: الترجمة والصوت بالخلفية من نفس جواب يوتيوب (محفوظ) — ولا طلب لسيرفرنا
  function extExtras() {
    setChip('بلا إعلانات ✓', 'ok');
    extManifest(id).then(({ data: d }) => {
      if (!np) return;
      if (d.captions.length) np.setCaptions(d.captions);
      const a = extAudio(d);
      if (a) np.setBgAudio(a);
    }).catch(() => {});
    if (ytInfo) ytInfo.then(d => { if (!d) infoFromPublic(); }); else infoFromPublic();
  }

  let publicUntil = 0, embedTimer = 0;
  // مصادرنا ما زبطت: بعد 7 ثواني إذا لسّا ما في فيديو شغّال، منروح ليوتيوب (حتى لو السيرفرات العامة عم تتأخّر)
  const armEmbed = at => {
    if (embedTimer || embedOn) return;
    embedTimer = setTimeout(() => {
      if (!box.isConnected || embedOn) return;
      const v = np && np.video;
      if (v && !v.paused && v.currentTime > 0.5) return; // سيرفر عام اشتغل
      embed(np && np.video && np.video.currentTime > 1 ? np.video.currentTime : at);
    }, 7000);
  };
  // لو مصدرنا فتح بس الفيديو ما بلّش خلال 12 ثانية: يوتيوب بواجهتنا
  let startT = 0;
  const armStart = at => {
    clearTimeout(startT);
    startT = setTimeout(() => {
      if (!box.isConnected || embedOn || !np || !np.video) return;
      const v = np.video;
      // اشتغل فعلاً؟ (إذا رجعت لورا بعد ما كمّلت من نص الفيديو، الوقت بيصير أقل من نقطة البداية — مش يعني إنو ما اشتغل)
      let played = 0;
      try { for (let i = 0; i < v.played.length; i++) played += v.played.end(i) - v.played.start(i); } catch { /* */ }
      if (v.currentTime > (at || 0) + 0.3 || played > 0.3 || v.seeking || np.userPaused) return;
      embed(at);
    }, 12000);
  };
  async function tryNext(startAt) {
    if (embedOn) return;
    // «تلقائي»: مصدرنا إذا زبط، وإلا (يوتيوب حاظر السيرفر أو واقف) مشغّل يوتيوب بواجهتنا فوراً — بلا لفّة عالسيرفرات العامة
    if (early) {
      const how = await early.catch(() => false); early = null;
      if (how === 'ext') { extExtras(); armStart(startAt); return; }
      if (how === 'own') { ownExtras(); armStart(startAt); return; }
    }
    if (!box.isConnected || embedOn) return;
    if (!shown) { if (ytInfo) ytInfo.then(d => { if (!d && box.isConnected) infoFromPublic(); }); else infoFromPublic(); }
    embed(startAt);
  }

  function fillInfo(d) {
    if (shown || !d) return; // انعرضت من قبل (من المصدر الأسرع)
    shown = d;
    document.title = `${d.title} — Nuvio`;
    if (np) {
      np.opts.onNext = () => goNext(pickNext(id, d.related, music, true));
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
    const item = { id, title: d.title, thumb: ytThumb(id), author: d.author, authorId: d.authorId, views: d.views, published: d.published, duration: pv && pv.duration, ...(music ? { music: true } : {}), ...(d.avatar ? { avatar: d.avatar } : {}) };
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
    likeBtn.onclick = () => { note(lib.toggle('likes', item) ? 'انضاف للإعجابات' : 'انشال من الإعجابات'); drawBtns(); };
    favBtn.onclick = () => { note(lib.toggle('favs', item) ? 'انحفظ بالقائمة المفضلة' : 'انشال من القائمة المفضلة'); drawBtns(); };
    drawBtns();
    const plBtn = el('button', 'pill');
    plBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 6h11M4 11h11M4 16h7M17 13v8M13 17h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>قائمة</span>';
    plBtn.onclick = () => addToPlaylist(item);
    actions.append(likeBtn, favBtn, plBtn);
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
      const lt = el('div', 'desc-links-t'); lt.innerHTML = window.ico('link'); lt.append(` الروابط (${urls.length})`);
      lk.append(lt);
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
    if (extras.chapters) extras.chapters(d.description || '');

    // المشابهة + تحميل لا نهائي
    fillRelated(d.related);
    // أول فيديو مشابه منجيب معلوماتو مسبقاً (غالباً رح تكبس عليه)
    if (d.related[0]) setTimeout(() => prefetchVideo(d.related[0].id), 4000);
  }

  setChip('…');
  // المشغّل الأساسي من الإعدادات: يوتيوب بواجهتنا (للتجربة) — مصادرنا ما بتشتغل أبداً
  if (prefs.get('player') === 'yt' && window.YtMedia && ytOnceOff !== id) {
    embed(startTime);
    if (ytInfo) ytInfo.then(d => { if (!box.isConnected) return; if (d) fillInfo(d); else infoFromPublic(); }); else infoFromPublic();
    return;
  }
  if (ytOnceOff === id) ytOnceOff = '';
  // تشغيل مبكر: رابط ملف DASH معروف مسبقاً، فمنبلّش الفيديو فوراً بنفس الوقت اللي عم تنجاب فيه معلوماتو
  // (معلومات الفيديو أحياناً بتاخد ٢-٤ ثواني عند السيرفر العام)
  let early = null;
  // من جهازك (إذا الإضافة مركّبة) — وبس هو: إذا ما زبط، مشغّل يوتيوب مباشرة، بلا سيرفرنا. بلا الإضافة: سيرفرنا
  const firstSrcs = [];
  if (extUsable()) firstSrcs.push({ kind: 'ext', id, url: 'nuvioext://direct/' + id });
  else if (svUsable()) firstSrcs.push({ kind: 'dash', url: ownMpd(id) });
  if (firstSrcs.length) {
    early = playSources(OWN_INST, firstSrcs, startTime).then(ok => {
      if (ok) return (srcList[srcIdx] || {}).kind === 'ext' ? 'ext' : 'own';
      if (firstSrcs.some(s => s.kind === 'dash')) svCheck();
      return false;
    });
  }
  // المعلومات من يوتيوب مباشرة (~نص ثانية) بنفس الوقت؛ السيرفر العام بيضل للفيديو نفسو
  if (ytInfo) ytInfo.then(d => { if (d && box.isConnected) fillInfo(d); });
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
  tvout: '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 20h7M12 16.5V20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10 8.2v5l4-2.5z"/></svg>',
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
        note(np.loop ? 'التكرار شغّال' : 'التكرار طافي');
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
    note('رح يوقف بآخر هالفيديو');
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
  note(`رح يوقف بعد ${min >= 60 ? (min === 60 ? 'ساعة' : 'ساعة ونص') : min + ' دقيقة'}`);
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
      const { res } = await cached('sg:' + q.toLowerCase(), 30 * 60e3, () => googleSuggest(q).then(res => ({ res }))
        .catch(() => withFallback(i => apiFor(i).suggest(i.url, q), { stagger: 900 })));
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

/* نقل المشغّل بالصفحة بلا ما ينعاد تحميلو: كروم الجديد بيعرف (moveBefore). غير هيك (سفاري): منكمّل من نفس الثانية */
function moveKeep(parent, node, before = null) {
  if (parent.moveBefore && node.isConnected && parent.isConnected) { try { parent.moveBefore(node, before); return; } catch { /* منكمّل عادي */ } }
  parent.insertBefore(node, before);
  if (node._ytResume) node._ytResume();
}

/* ================= كمبيوتر: لمّا تنزل بالصفحة والفيديو شغّال، بيصغر وبيطلع عاليمين تحت — ولمّا تطلع بيرجع ================= */
const canFloat = () => matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)').matches;
function floatOnScroll(box) {
  const ph = el('div', 'float-ph');
  box.before(ph);
  let on = false, off = false, raf = 0, h = 0;
  const bar = el('div', 'float-bar');
  const up = el('button', 'float-btn'); up.title = 'رجّع الفيديو لفوق'; up.setAttribute('aria-label', up.title);
  up.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>';
  const x = el('button', 'float-btn'); x.title = 'سكّر'; x.setAttribute('aria-label', x.title);
  x.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  bar.append(up, x);
  up.onclick = e => { e.stopPropagation(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  x.onclick = e => { e.stopPropagation(); off = true; set(false); const n = window.__nuvioNp; if (n && n.video && !n.video.paused) n.video.pause(); };
  bar.addEventListener('pointerdown', e => e.stopPropagation());
  const set = v => {
    if (v === on) return;
    const n = window.__nuvioNp; if (n && n.markTransition) n.markTransition();
    if (v) { h = box.getBoundingClientRect().height; ph.style.height = h + 'px'; }
    on = v;
    box.classList.toggle('floating', v);
    if (v) box.append(bar); else { bar.remove(); ph.style.height = ''; }
  };
  const check = () => {
    raf = 0;
    if (!box.isConnected) { stop(); return; }
    if (!ph.isConnected || box.classList.contains('in-mini') || document.fullscreenElement || box.classList.contains('fakefs') || !canFloat()) { set(false); return; }
    const top = ph.getBoundingClientRect().top;
    const bottom = top + (on ? h : box.getBoundingClientRect().height);
    if (bottom > 140) off = false;
    if (!on && bottom < 70) {
      const n = window.__nuvioNp;
      if (off || !n || !n.video || n.video.paused) return; // بس إذا عم يشتغل
      set(true);
    } else if (on && bottom > 140) set(false);
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  function stop() { removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); }
}

/* ================= المشغّل الصغير (اسحب الفيديو لتحت) ================= */
let active = null;          // الفيديو اللي عم يشتغل هلّق
let miniOn = false;
let lastPage = '#/';
const mini = el('div', 'mini'); mini.hidden = true;
document.body.append(mini);

function minimize(nav = true) {
  if (!active || miniOn) return;
  const { box, id } = active;
  miniOn = true;
  const mnp = active.np(); const mv0 = mnp && mnp.video; const wasPlaying = !!(mv0 && !mv0.paused && !mv0.ended);
  if (mnp && mnp.markTransition) mnp.markTransition();
  if (wasPlaying) setTimeout(() => { if (mv0.paused && !mnp.userPaused && mv0.isConnected) mv0.play().catch(() => {}); }, 120);
  box.style.transition = 'none'; box.style.transform = ''; box.style.opacity = '';
  box.classList.remove('floating');
  const from = box.getBoundingClientRect();
  const ph = el('div', 'player-ph'); ph.id = 'player-ph';
  box.before(ph);                      // منحط مكانو علامة لحتى نرجّعو
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
  const vid = el('div', 'mini-vid');
  vid.onclick = () => info.click();
  mini.append(vid, info, pp, x);
  moveKeep(vid, box);
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
  // ارجع لآخر صفحة كنت فيها غير الفيديو (مثلاً البحث) — إلا إذا التصغير صار لأنك رحت لصفحة تانية
  if (nav) location.hash = lastPage || '#/';
}
function restoreMini() {
  if (!miniOn || !active) return false;
  const mv = mini.querySelector('.mini-vid');
  const from = mv ? mv.getBoundingClientRect() : null;
  miniOn = false;
  mini.hidden = true; document.body.classList.remove('has-mini');
  const { box, layout } = active;
  const rnp = active.np(); const rv = rnp && rnp.video; const wasPlaying = !!(rv && !rv.paused && !rv.ended);
  if (rnp && rnp.markTransition) rnp.markTransition();
  if (wasPlaying) setTimeout(() => { if (rv.paused && !rnp.userPaused && rv.isConnected) rv.play().catch(() => {}); }, 120);
  box.classList.remove('in-mini');
  view.replaceChildren(layout);
  const ph = layout.querySelector('#player-ph');
  if (ph) { moveKeep(ph.parentNode, box, ph); ph.remove(); } else moveKeep(active.main, box, active.main.firstChild);
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
      if (e.cancelable) e.preventDefault(); // السحبة للفيديو بس — الصفحة ورا ما بتتحرّك معها
      const d = Math.min(dy, 320);
      box.style.transition = 'none';
      box.style.transformOrigin = 'bottom center';
      box.style.transform = `translateY(${d * 0.85}px) scale(${1 - d / 900})`;
      box.style.opacity = String(1 - d / 900);
    }
  }, { passive: false });
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
const APP_VERSION = '20261121014325';
async function checkUpdate() {
  try {
    const r = await fetch(`version.txt?x=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const v = (await r.text()).trim();
    if (!v || v === APP_VERSION) return;
    // إذا حاولنا وضلّت النسخة القديمة (GitHub أحياناً بيتأخّر)، منعيد المحاولة بعد دقيقة، لحد 3 مرات
    const prev = store.get('reloadedFor', null);
    const t = prev && typeof prev === 'object' ? prev : { v: prev, n: 1, at: 0 };
    if (t.v === v && (t.n >= 3 || Date.now() - t.at < 60e3)) return;
    if (active && active.np() && !active.np().video.paused) return; // ما منقطع فيديو شغّال
    // منحدّث بس بلحظة ما بتفرق معك: أول ما يفتح الموقع (أول 6 ثواني)، أو لمّا ترجعلو بعد دقيقتين أو أكتر.
    // غير هيك النسخة الجديدة بتنحمّل بالخلفية وبتشتغل بالفتحة الجاية — ما منقطع شي إنت عم تعملو.
    const regNow = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (regNow) regNow.update().catch(() => {});
    const fresh = performance.now() < 6000, back = hiddenAt && Date.now() - hiddenAt > 120e3;
    if (!fresh && !back && regNow) return;
    store.set('reloadedFor', { v, n: t.v === v ? t.n + 1 : 1, at: Date.now() });
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
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => { if (document.hidden) { hiddenAt = Date.now(); return; } checkUpdate().finally(() => { hiddenAt = 0; }); });

/* ================= ذاكرة الصفحات =================
   لمّا ترجع لصفحة (الرئيسية، البحث، القناة…) بتلاقيها متل ما تركتها: نفس القائمة ونفس مكان التمرير.
   الرئيسية ما بتتحدّث إلا إذا سحبت سحبة طويلة من فوق لتحت. */
const pageCache = new Map();
let shownKey = null;
const CACHEABLE = k => /^\/($|search\?|subs$|subs\?|channel\?|lists$|music$|music\/podcast$|music\/fav$)/.test(k);
function savePage() {
  if (!shownKey || !CACHEABLE(shownKey) || !view.childNodes.length) return;
  if (view.querySelector('.grid > .sk-card:first-child')) return; // لسا عم تحمّل أول مرة
  if (view.querySelector('.watch, .player-ph')) return; // صفحة فيديو — ما بتنحفظ هون
  pageCache.set(shownKey, { nodes: [...view.childNodes], y: window.scrollY, title: document.title, at: Date.now() });
  if (pageCache.size > 10) pageCache.delete(pageCache.keys().next().value);
}
function restorePage(key) {
  const c = pageCache.get(key);
  if (!c || Date.now() - c.at > 60 * 60e3) return false;
  view.replaceChildren(...c.nodes);
  document.title = c.title;
  refreshLive(); // اشتركت/شفت/بحثت عن شي من وقتها؟ بيبيّن فوراً
  if (ext('tvAfterRestore')) ext('tvAfterRestore')();
  refreshBars(view);
  markLoaded(view);
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
let routeSeq = 0;
// دوال من ملفات تانية: إذا ملف ما وصل (مثلاً لحظة تحديث)، منكمّل بلاه بدل ما يوقف كل الموقع
const ext = name => (typeof window[name] === 'function' ? window[name] : null);
const tvOn = () => { const f = ext('isTV'); return !!(f && f()); };
async function route() {
  try { await routeInner(); } catch (e) {
    console.error('[nuvio] route', e);
    const box = el('div', 'empty');
    box.append(el('p', null, 'صار خطأ بهالصفحة 😕'));
    const b = el('button', 'btn btn-main', 'حدّث الصفحة'); b.onclick = () => location.reload();
    box.append(b);
    view.replaceChildren(box);
  }
}
async function routeInner() {
  const seq = ++routeSeq;
  const hash = location.hash.slice(1) || '/';
  savePage();
  const [path, qs] = hash.split('?');
  if (path !== '/shorts') shortsExit();
  updateBottomNav();
  const p = new URLSearchParams(qs || '');
  hideSug();
  document.querySelectorAll('.top-nav a').forEach(x => x.classList.toggle('on', x.getAttribute('href') === '#' + path));
  document.body.classList.toggle('watching', path === '/watch');
  document.body.classList.toggle('home-page', path === '/');
  if (typeof fillGuide === 'function') fillGuide();
  if (path !== '/watch') lastPage = '#' + hash;
  if (path === '/watch' && active && miniOn && p.get('v') === active.id) { shownKey = hash; restoreMini(); window.scrollTo(0, 0); return; }
  if (path === '/watch' && miniOn) await closeMini();
  if (path === '/watch' && active && !miniOn && active.id !== p.get('v')) { const n = active.np(); if (n) n.destroy(); active = null; }
  // طلعت من صفحة الفيديو (كبست عالقناة، رجعت، فتحت صفحة تانية): الفيديو بيصغر للشريط تحت متل يوتيوب
  if (path !== '/watch' && active && !miniOn && active.np() && active.box.isConnected && !tvOn()) minimize(false);
  // إذا طلعت من الفيديو وهو مش مصغّر (ما اشتغل أصلاً)، منوقّفو
  if (path !== '/watch' && !miniOn) { await destroyPlayer(); if (active) { const n = active.np(); if (n) { n.pauseAll(); n.destroy(); } active = null; } }
  if (seq !== routeSeq) return; // صار في تنقّل أحدث وإحنا ناطرين
  shownKey = hash;
  if (path === '/') setMode('video'); else if (path.startsWith('/music')) setMode('music');
  if (path !== '/watch' && restorePage(hash)) {
    $('#q').value = path === '/search' ? (p.get('q') || '') : '';
    return;
  }
  window.scrollTo(0, 0);
  if (path === '/search' && p.get('q')) return renderSearch(p.get('q'), { sort: p.get('sort') || '', date: p.get('date') || '', dur: p.get('dur') || '', feat: p.get('feat') || '', type: p.get('type') || '' });
  if (path === '/watch' && p.get('v')) return renderWatch(p.get('v'), +p.get('t') || 0);
  if (path === '/channel' && p.get('id')) return renderChannel(p.get('id'), p.get('tab') || 'home', p.get('sort') || '');
  if (path === '/pl' && p.get('id')) return renderPlaylist(p.get('id'));
  if (path === '/shorts') return renderShorts(p.get('v'), p.get('ch'));
  if (path === '/tvsearch') return renderTVSearch();
  if (path === '/me') return renderMe();
  if (path === '/settings') return renderSettings();
  if (path === '/login') return renderLogin(p.get('m') || 'login');
  if (path === '/admin') return renderAdmin();
  if (path === '/pair') return renderPair(p.get('c') || '');
  if (path === '/devices') return renderDevices();
  if (path === '/lib') return renderLibView(p.get('t') || 'videos', p.get('k') || 'hist');
  if (path === '/plist' && p.get('id')) return renderUserPlaylist(p.get('id'));
  if (path === '/later') return renderLibrary('later');
  if (path === '/history') return renderLibrary('hist');
  if (path === '/likes') return renderLibrary('likes');
  if (path === '/favs') return renderLibrary('favs');
  if (path === '/searches') return renderSearches();
  if (path.startsWith('/music')) return renderMusic(path, p);
  if (path === '/subs') return renderSubs(p.get('f') || 'new');
  if (path === '/lists') return renderLists();
  if (path === '/list' && p.get('id')) return renderList(p.get('id'));
  $('#q').value = '';
  setMode('video');
  if (tvOn()) return renderTVHome();
  return renderHome();
}
window.addEventListener('hashchange', route);

/* ================= البداية ================= */
if (window.shaka) shaka.polyfill.installAll();
/* ================= الرفوف الأفقية على الكمبيوتر =================
   - دولاب الماوس فوق رف أفقي بيحرّكو يمين/يسار (وإذا وصل للآخر بترجع الصفحة تنزل عادي)
   - أسهم ‹ › على الطرفين بتنقل صفحة كاملة */
const HSCROLL = '.shelf, .sub-strip, .chips, .filter-bar, .ch-strip';
document.addEventListener('wheel', e => {
  if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
  const sh = e.target.closest && e.target.closest(HSCROLL);
  if (!sh || sh.scrollWidth <= sh.clientWidth + 2) return;
  const before = sh.scrollLeft;
  sh.scrollLeft -= e.deltaY; // الصفحة يمين-لليسار: لتحت = لقدّام (يسار)
  if (sh.scrollLeft !== before) e.preventDefault();
}, { passive: false });

const ARROW_L = '<svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>';
const ARROW_R = '<svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg>';
function decorateScroller(sh) {
  if (sh.dataset.hs || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (!sh.matches('.shelf, .sub-strip')) return;
  sh.dataset.hs = '1';
  const wrap = el('div', 'hs-wrap');
  sh.replaceWith(wrap); wrap.append(sh);
  const mk2 = (cls, html, dir) => {
    const b = el('button', 'hs-btn ' + cls); b.innerHTML = html; b.setAttribute('aria-label', dir > 0 ? 'التالي' : 'السابق');
    b.onclick = () => sh.scrollBy({ left: dir * sh.clientWidth * 0.85, behavior: 'smooth' });
    wrap.append(b); return b;
  };
  const next = mk2('next', ARROW_L, -1), prev = mk2('prev', ARROW_R, 1);
  const upd = () => {
    const max = sh.scrollWidth - sh.clientWidth;
    const pos = Math.abs(sh.scrollLeft);
    prev.hidden = pos < 4; next.hidden = pos > max - 4 || max <= 4;
  };
  sh.addEventListener('scroll', upd, { passive: true });
  new ResizeObserver(upd).observe(sh);
  new MutationObserver(upd).observe(sh, { childList: true });
  upd();
}
new MutationObserver(muts => {
  for (const m of muts) for (const n of m.addedNodes) {
    if (n.nodeType !== 1) continue;
    if (n.matches && n.matches('.shelf, .sub-strip')) decorateScroller(n);
    n.querySelectorAll && n.querySelectorAll('.shelf, .sub-strip').forEach(decorateScroller);
    markLoaded(n);
  }
}).observe(document.getElementById('view'), { childList: true, subtree: true });

/* تحميل الصور: كل صورة بتبلّش هيكل نابض، ولمّا تجهز بتبيّن بنعومة.
   الصورة اللي شفناها قبل (بالذاكرة) بتطلع فوراً بلا حركة. */
const loadedSrc = new Set();
function imgReady(img) {
  if (img.classList.contains('ok')) return;
  const src = img.currentSrc || img.src;
  if (loadedSrc.has(src)) img.classList.add('now'); else loadedSrc.add(src);
  img.classList.remove('bad'); // صورة احتياطية اشتغلت بعد ما فشلت الأولى
  img.classList.add('ok');
}
function markLoaded(root) {
  if (root.tagName === 'IMG') { if (root.complete && root.naturalWidth) imgReady(root); return; }
  if (root.querySelectorAll) root.querySelectorAll('img:not(.ok)').forEach(i => { if (i.complete && i.naturalWidth) imgReady(i); });
}
document.addEventListener('load', e => { if (e.target.tagName === 'IMG') imgReady(e.target); }, true);
document.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.classList.add('bad'); }, true);

if (navigator.connection && navigator.connection.addEventListener) {
  navigator.connection.addEventListener('change', () => { if (player) try { player.configure(saverCfg()); } catch { /* */ } });
}

/* اتصال مسبق مع أسرع سيرفر وصوره */
function preconnect(origin) {
  if (!origin || document.querySelector(`link[rel=preconnect][href="${origin}"]`)) return;
  const l = document.createElement('link'); l.rel = 'preconnect'; l.href = origin; l.crossOrigin = 'anonymous';
  document.head.append(l);
}
try { const best = orderedInstances()[0]; if (best) preconnect(best.url); } catch { /* */ }
ready.then(() => { const best = orderedInstances()[0]; if (best) preconnect(best.url); });

/* تخزين هيكل الموقع على الجهاز (بيفتح فوراً حتى بلا ما ينزّل شي) */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
probeAll();
discover();
checkUpdate();
setInterval(() => probeAll(), 10 * 60e3);
// التشغيل: كل خطوة لحالها، إذا وحدة فشلت الباقي بيكمّل
// الشاشات الكبيرة: زر QR جنب البحث — بتكتب أو بتحكي عالتلفون وبيبحث هون
(function addRemoteSearchBtn() {
  try {
    if (matchMedia('(pointer: coarse)').matches || innerWidth < 900) return;
    const form = document.getElementById('searchForm'); if (!form || form.querySelector('.qr-search')) return;
    const b = el('button', 'qr-search'); b.type = 'button'; b.title = 'ابحث من تلفونك'; b.setAttribute('aria-label', 'ابحث من تلفونك');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/></svg>';
    b.onclick = () => openRemoteQr(q => { location.hash = '#/search?q=' + encodeURIComponent(q); });
    form.insertBefore(b, form.querySelector('button[type=submit]'));
  } catch { /* */ }
})();
for (const name of ['buildBottomNav', 'tvInit', 'accInit']) {
  try { const f = ext(name); if (f) { const r = f(); if (r && r.catch) r.catch(e => console.warn('[nuvio]', name, e)); } } catch (e) { console.warn('[nuvio]', name, e); }
}
route();
