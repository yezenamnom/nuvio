/* Nuvio — واجهة شخصية لمشاهدة الفيديو بلا إعلانات.
   بتحكي مع سيرفرات Invidious / Piped العامة، وبتشغّل البث بعنصر <video> عادي (عبر Shaka للـ DASH/HLS).
   إذا فشل كل شي، بتستعمل مشغّل youtube-nocookie المضمّن. */
'use strict';

/* ---------------- السيرفرات ---------------- */
const DEFAULT_INSTANCES = [
  { url: 'https://yt.chocolatemoo53.com', type: 'invidious' },
  { url: 'https://inv.nadeko.net', type: 'invidious' },
  { url: 'https://invidious.nerdvpn.de', type: 'invidious' },
  { url: 'https://yewtu.be', type: 'invidious' },
  { url: 'https://invidious.tiekoetter.com', type: 'invidious' },
  { url: 'https://iv.melmac.space', type: 'invidious' },
  { url: 'https://api.piped.private.coffee', type: 'piped' },
  { url: 'https://pipedapi.kavin.rocks', type: 'piped' },
  { url: 'https://pipedapi.adminforge.de', type: 'piped' },
];

const store = {
  get(k, d) { try { const v = localStorage.getItem('nuvio:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('nuvio:' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

const instances = DEFAULT_INSTANCES;
/* صحّة كل سيرفر وسرعتو، محفوظة لحتى الفتحة الجاية تبلّش بالأسرع */
const health = store.get('health', {}); // url -> { ok: bool, ms: number, at: time }

function mark(url, ok, ms) {
  health[url] = { ok, ms: ms || 99999, at: Date.now() };
  store.set('health', health);
}
/* الأسرع الشغّال أول، بعدين اللي ما انفحص، بعدين المعطوب */
function orderedInstances() {
  const score = i => {
    const h = health[i.url];
    if (!h) return 50000;
    if (!h.ok) return Date.now() - h.at > 10 * 60 * 1000 ? 60000 : 90000; // المعطوب منرجع نجرّبو بعد 10 دقايق
    return h.ms;
  };
  return [...instances].sort((a, b) => score(a) - score(b));
}

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

/* تبديل تلقائي سريع: منبلّش بالأسرع، وإذا تأخّر أكتر من ثانيتين ونص منبلّش بالتاني بنفس الوقت،
   وإذا فشل واحد منروح فوراً عالي بعدو. أول واحد بيرد بيربح. */
function withFallback(op, { skip = [], stagger = 2500 } = {}) {
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
        console.warn('[nuvio]', inst.url, e);
        if (done) return;
        if (idx < list.length) launch();
        else if (!running) { const err = new Error('ما في سيرفر عم يرد هلّق، جرّب بعد شوي'); err.details = errors; reject(err); }
      });
      if (idx < list.length) timer = setTimeout(launch, stagger);
    };
    launch();
  });
}

/* فحص خفيف بالخلفية أول ما يفتح الموقع، لحتى نعرف مين الأسرع */
function probeAll() {
  for (const inst of instances) {
    const h = health[inst.url];
    if (h && Date.now() - h.at < 5 * 60 * 1000) continue;
    const t0 = performance.now();
    const url = inst.type === 'piped' ? `${inst.url}/trending?region=DE` : `${inst.url}/api/v1/search?q=a&type=video`;
    fetchJSON(url, 8000).then(() => mark(inst.url, true, performance.now() - t0), () => mark(inst.url, false));
  }
}

/* ---------------- محوّلات الـ API ---------------- */
const abs = (base, u) => (!u ? '' : u.startsWith('//') ? 'https:' + u : u.startsWith('/') ? base + u : u);
const ytThumb = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

const Invidious = {
  pickThumb(base, arr, id) {
    const t = (arr || []).find(x => x.quality === 'medium') || (arr || []).find(x => x.quality === 'high') || (arr || [])[0];
    return t ? abs(base, t.url) : ytThumb(id);
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
    return { items: d.filter(v => v.type === 'video').map(v => Invidious.item(base, v)), next: page + 1 };
  },
  pickAvatar(base, arr) {
    const a = (arr || []).filter(x => x.width >= 88).sort((x, y) => x.width - y.width)[0] || (arr || []).slice(-1)[0];
    return a ? abs(base, a.url) : '';
  },
  async channels(base, q) {
    const d = await fetchJSON(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=channel&page=1`);
    return (Array.isArray(d) ? d : []).filter(c => c.type === 'channel').slice(0, 3).map(c => ({
      id: c.authorId, name: c.author, avatar: Invidious.pickAvatar(base, c.authorThumbnails),
      subs: c.subCount, videos: c.videoCount,
    }));
  },
  async channel(base, id, cont) {
    const vids = await fetchJSON(`${base}/api/v1/channels/${id}/videos${cont ? `?continuation=${encodeURIComponent(cont)}` : ''}`, 20000);
    const items = (vids.videos || []).map(v => Invidious.item(base, v));
    if (cont) return { items, next: vids.continuation || null };
    const d = await fetchJSON(`${base}/api/v1/channels/${id}`, 20000);
    const banner = (d.authorBanners || [])[0];
    return {
      info: {
        id, name: d.author, avatar: Invidious.pickAvatar(base, d.authorThumbnails), banner: banner ? abs(base, banner.url) : '',
        subs: d.subCount, description: d.description || '',
      },
      items, next: vids.continuation || null,
    };
  },
  async trending(base) {
    let d = [];
    try { d = await fetchJSON(`${base}/api/v1/trending?region=DE`); } catch { /* جرّب popular */ }
    if (!Array.isArray(d) || !d.length) d = await fetchJSON(`${base}/api/v1/popular`);
    if (!Array.isArray(d) || !d.length) throw new Error('ما في رائج');
    return d.filter(v => v.videoId).map(v => Invidious.item(base, v));
  },
  async video(base, id) {
    const d = await fetchJSON(`${base}/api/v1/videos/${id}`, 20000);
    const sources = [];
    // DASH عبر بروكسي السيرفر (local=true) — روابط googlevideo المباشرة مربوطة بـ IP السيرفر
    sources.push({ kind: 'dash', url: `${base}/api/manifest/dash/id/${id}?local=true` });
    for (const f of (d.formatStreams || []).slice().reverse()) {
      sources.push({ kind: 'mp4', url: `${base}/latest_version?id=${id}&itag=${f.itag}&local=true`, label: f.qualityLabel });
    }
    if (d.liveNow && d.hlsUrl) sources.unshift({ kind: 'hls', url: abs(base, d.hlsUrl) });
    return {
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
  async channels() { return []; },
  async channel(base, id, cont) {
    const d = cont
      ? await fetchJSON(`${base}/nextpage/channel/${id}?nextpage=${encodeURIComponent(cont)}`)
      : await fetchJSON(`${base}/channel/${id}`, 20000);
    const items = (d.relatedStreams || []).filter(v => v.type === 'stream').map(Piped.item);
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
    const d = await fetchJSON(`${base}/streams/${id}`, 20000);
    const sources = [];
    if (d.hls) sources.push({ kind: 'hls', url: d.hls });
    for (const s of (d.videoStreams || []).filter(s => !s.videoOnly)) sources.push({ kind: 'mp4', url: s.url, label: s.quality });
    if (!sources.length) throw new Error('ما في بث');
    const txt = new DOMParser().parseFromString((d.description || '').replace(/<br\s*\/?>/gi, '\n'), 'text/html').body.textContent;
    return {
      id, title: d.title, author: d.uploader, authorId: (d.uploaderUrl || '').split('/channel/')[1] || '',
      avatar: d.uploaderAvatar || '', subs: d.uploaderSubscriberCount > 0 ? `${nf.format(d.uploaderSubscriberCount)} مشترك` : '', views: d.views, published: d.uploadDate?.slice(0, 10) || '',
      likes: d.likes, description: txt || '',
      related: (d.relatedStreams || []).filter(v => v.type === 'stream').map(Piped.item),
      sources,
    };
  },
};
const apiFor = inst => (inst.type === 'piped' ? Piped : Invidious);

/* ---------------- أدوات ---------------- */
const $ = s => document.querySelector(s);
const view = $('#view');
const host = u => { try { return new URL(u).host; } catch { return u; } };
const nf = new Intl.NumberFormat('ar', { notation: 'compact', maximumFractionDigits: 1 });
const fmtViews = (n, t) => (n != null && n > 0 ? `${nf.format(n)} مشاهدة` : t || '');
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

function loading(msg = 'عم يحمّل…') {
  view.replaceChildren();
  const d = el('div', 'loading'); d.append(el('div', 'spinner'), el('div', null, msg)); view.append(d);
}
function showError(err, retry) {
  view.replaceChildren();
  const d = el('div', 'empty');
  d.append(el('p', null, err.message || 'صار خطأ'));
  if (err.details) { const s = el('pre', null, err.details.join('\n')); s.style.cssText = 'direction:ltr;text-align:left;font-size:.75rem;white-space:pre-wrap;opacity:.7'; d.append(s); }
  if (retry) { const b = el('button', 'btn primary', 'جرّب مرة تانية'); b.onclick = retry; d.append(b); }
  view.append(d);
}

function card(v) {
  const c = $('#cardTpl').content.firstElementChild.cloneNode(true);
  c.href = `#/watch?v=${encodeURIComponent(v.id)}`;
  const img = c.querySelector('img');
  img.src = v.thumb;
  img.onerror = () => { if (img.src !== ytThumb(v.id)) img.src = ytThumb(v.id); };
  c.querySelector('.dur').textContent = v.live ? 'مباشر' : fmtDur(v.duration);
  const t = c.querySelector('.title');
  t.textContent = v.title; t.title = v.title; t.dir = 'auto';
  const views = v.live && !v.views ? '' : fmtViews(v.views, v.viewsText);
  const sub = c.querySelector('.sub');
  if (v.author && v.authorId) {
    const a = el('span', 'ch-link', v.author);
    a.onclick = e => { e.preventDefault(); e.stopPropagation(); location.hash = `#/channel?id=${encodeURIComponent(v.authorId)}`; };
    sub.append(a);
  } else if (v.author) sub.append(v.author);
  const rest = [views, v.published].filter(Boolean).join(' • ');
  if (rest) sub.append((v.author ? ' • ' : '') + rest);
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
const fmtSubs = n => (n > 0 ? `${nf.format(n)} مشترك` : '');
const chHref = id => `#/channel?id=${encodeURIComponent(id)}`;

function channelCard(ch) {
  const a = el('a', 'ch-card'); a.href = chHref(ch.id);
  const img = el('img'); img.alt = ''; setImg(img, ch.avatar);
  const meta = el('div');
  const n = el('div', 'ch-name', ch.name); n.dir = 'auto';
  meta.append(n, el('div', 'sub', [fmtSubs(ch.subs), ch.videos > 0 ? `${nf.format(ch.videos)} فيديو` : ''].filter(Boolean).join(' • ')));
  a.append(img, meta);
  return a;
}

async function renderChannel(id) {
  loading('عم يجيب القناة…');
  try {
    const { inst, res } = await withFallback(i => apiFor(i).channel(i.url, id));
    const { info } = res;
    document.title = `${info.name} — Nuvio`;
    view.replaceChildren();
    const head = el('div', 'ch-head');
    if (info.banner) { const b = el('img', 'ch-banner'); b.alt = ''; setImg(b, info.banner); head.append(b); }
    const row = el('div', 'ch-row');
    const av = el('img', 'ch-avatar'); av.alt = ''; setImg(av, info.avatar);
    const txt = el('div');
    const h = el('h1', 'ch-title', info.name); h.dir = 'auto';
    txt.append(h, el('div', 'sub', [fmtSubs(info.subs)].filter(Boolean).join(' • ')));
    row.append(av, txt); head.append(row);
    if (info.description) {
      const d = el('div', 'desc', info.description);
      d.onclick = () => d.classList.toggle('open');
      head.append(d);
    }
    view.append(head, el('h2', 'section-title', 'الفيديوهات'));
    const g = el('div', 'grid'); res.items.forEach(v => g.append(card({ ...v, authorId: null }))); view.append(g);
    if (!res.items.length) view.append(el('div', 'empty', 'ما في فيديوهات.'));
    let next = res.next;
    if (next) {
      const wrap = el('div', 'more'); const b = el('button', 'btn', 'المزيد'); wrap.append(b); view.append(wrap);
      b.onclick = async () => {
        b.disabled = true; b.textContent = 'عم يحمّل…';
        try {
          const r = await apiFor(inst).channel(inst.url, id, next);
          r.items.forEach(v => g.append(card({ ...v, authorId: null })));
          next = r.next;
          if (!next || !r.items.length) wrap.remove();
        } catch (e) { note('ما قدرت جيب المزيد: ' + e.message); }
        b.disabled = false; b.textContent = 'المزيد';
      };
    }
  } catch (e) { showError(e, () => renderChannel(id)); }
}

/* ---------------- الصفحات ---------------- */
async function renderHome() {
  document.title = 'Nuvio — فيديو بلا إعلانات';
  loading();
  try {
    const { res } = await withFallback(inst => apiFor(inst).trending(inst.url));
    view.replaceChildren(el('h2', 'section-title', 'الرائج حالياً'));
    const g = el('div', 'grid'); res.forEach(v => g.append(card(v))); view.append(g);
  } catch {
    // الرائج معطّل بأغلب السيرفرات العامة — اعرض اقتراحات بحث
    view.replaceChildren();
    const d = el('div', 'empty');
    d.append(el('p', null, 'الرائج مش متوفر هلّق. ابحث عن شي بدّك ياه:'));
    const row = el('div', 'v-actions'); row.style.justifyContent = 'center';
    for (const s of ['أخبار', 'وثائقي', 'موسيقى عربية', 'طبخ', 'lofi', 'برمجة']) {
      const b = el('a', 'btn', s); b.href = `#/search?q=${encodeURIComponent(s)}`; row.append(b);
    }
    d.append(row); view.append(d);
  }
}

async function renderSearch(q) {
  document.title = `${q} — Nuvio`;
  $('#q').value = q;
  loading('عم يدوّر…');
  let state;
  const run = async () => {
    const { inst, res } = await withFallback(i => apiFor(i).search(i.url, q, 1));
    state = { inst, next: res.next, seen: new Set(res.items.map(v => v.id)) };
    return res.items;
  };
  try {
    const items = await run();
    view.replaceChildren(el('h2', 'section-title', `نتائج: ${q}`));
    if (!items.length) { view.append(el('div', 'empty', 'ما في نتائج.')); return; }
    const chWrap = el('div', 'ch-strip'); view.append(chWrap);
    apiFor(state.inst).channels(state.inst.url, q).then(list => list.forEach(ch => chWrap.append(channelCard(ch)))).catch(() => {});
    const g = el('div', 'grid'); items.forEach(v => g.append(card(v))); view.append(g);
    if (state.next) {
      const wrap = el('div', 'more'); const b = el('button', 'btn', 'المزيد'); wrap.append(b); view.append(wrap);
      b.onclick = async () => {
        b.disabled = true; b.textContent = 'عم يحمّل…';
        try {
          const page = typeof state.next === 'number' ? state.next : 0;
          const r = await apiFor(state.inst).search(state.inst.url, q, page, typeof state.next === 'string' ? state.next : null);
          r.items.filter(v => !state.seen.has(v.id)).forEach(v => { state.seen.add(v.id); g.append(card(v)); });
          state.next = r.next;
          if (!r.next || !r.items.length) wrap.remove();
        } catch (e) { note('ما قدرت جيب المزيد: ' + e.message); }
        b.disabled = false; b.textContent = 'المزيد';
      };
    }
  } catch (e) { showError(e, () => renderSearch(q)); }
}

/* ---- تصليح لسيرفرات البث الفرعية المعطوبة ----
   بعض السيرفرات بتوزّع البث على أسماء فرعية مرقّمة (yt-comp1, yt-comp2 …).
   لاحظنا إنو بعضها عندو خلل بشهادة TLS/ECH بيرفضو Chrome، والتانيين سليمين وبيقبلو نفس الرابط.
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

let player = null;     // Shaka player
async function destroyPlayer() {
  if (player) { try { await player.destroy(); } catch { /* ignore */ } player = null; }
}

async function renderWatch(id) {
  await destroyPlayer();
  loading('عم يجيب الفيديو…');
  const tried = [];
  let current; // { inst, data }

  const layout = el('div', 'watch');
  const main = el('div', 'watch-main');
  const box = el('div', 'player-box');
  const info = el('div', 'info');
  const side = el('aside', 'related');
  main.append(box, info); layout.append(main, side);

  const msg = text => { box.querySelector('.player-msg')?.remove(); if (text) box.append(el('div', 'player-msg', text)); };
  const chip = el('span', 'chip');
  const setChip = (text, cls) => { chip.textContent = text; chip.className = 'chip ' + (cls || ''); };

  function embed() {
    destroyPlayer();
    if (np) { np.destroy(); np = null; }
    box.classList.remove('np', 'ui', 'paused', 'loading');
    box.replaceChildren();
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1`;
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    box.append(f);
    setChip('مشغّل احتياطي', 'warn');
  }

  let np = null, srcList = [], srcIdx = 0, curInst = null, reloads = 0, secondRound = false;

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
          bufferingGoal: 40, rebufferingGoal: 1.5,
          retryParameters: { maxAttempts: 4, baseDelay: 400, backoffFactor: 1.6, timeout: 12000 },
          stallEnabled: true, stallThreshold: 1, stallSkip: 0.1,
        },
        manifest: { retryParameters: { maxAttempts: 3, baseDelay: 400, timeout: 12000 } },
        abr: { enabled: true },
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
    if (!np || !np.box.isConnected || !box.contains(np.video)) {
      np = new NuvioPlayer(box, { onStall: t => recover(t), onError: t => recover(t) });
    }
    np.message('');
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
      const { inst, res } = await withFallback(i => apiFor(i).video(i.url, id), { skip: tried });
      tried.push(inst.url);
      if (!layout.isConnected) { view.replaceChildren(layout); }
      if (!current) fillInfo(res);
      current = { inst, data: res };
      if (await playSources(inst, res.sources, startAt)) return;
      mark(inst.url, false);
      return tryNext(startAt);
    } catch (e) {
      if (!layout.isConnected) view.replaceChildren(layout);
      // دورة تانية على كل السيرفرات قبل المشغّل الاحتياطي (الخلل عندهن غالباً مؤقت)
      if (!secondRound && tried.length) { secondRound = true; tried.length = 0; return tryNext(startAt); }
      if (!current) info.replaceChildren(el('h1', 'v-title', 'ما قدرت جيب معلومات الفيديو'));
      embed();
    }
  }

  function fillInfo(d) {
    document.title = `${d.title} — Nuvio`;
    info.replaceChildren();
    const h1 = el('h1', 'v-title', d.title); h1.dir = 'auto';
    info.append(h1);
    const row = el('div', 'v-row');
    const au = el(d.authorId ? 'a' : 'span', 'author');
    if (d.authorId) au.href = chHref(d.authorId);
    if (d.avatar) { const im = el('img', 'author-avatar'); im.alt = ''; setImg(im, d.avatar); au.append(im); }
    const an = el('span', null, d.author || ''); an.dir = 'auto'; au.append(an);
    if (d.subs) au.append(el('span', 'author-subs', d.subs));
    row.append(au, el('span', null, fmtViews(d.views)), el('span', null, d.published || ''));
    if (d.likes > 0) row.append(el('span', null, `👍 ${nf.format(d.likes)}`));
    info.append(row);

    const actions = el('div', 'v-actions');
    const share = el('button', 'btn', 'انسخ الرابط الأصلي');
    share.onclick = () => navigator.clipboard?.writeText(`https://youtu.be/${id}`).then(() => note('انسخ ✓'), () => note(`https://youtu.be/${id}`));
    actions.append(share, chip);
    info.append(actions);

    if (d.description) {
      const desc = el('div', 'desc', d.description);
      desc.title = 'اضغط لتفتح/تسكّر الوصف';
      desc.onclick = () => desc.classList.toggle('open');
      info.append(desc);
    }
    side.replaceChildren(el('h2', 'section-title', 'فيديوهات مشابهة'));
    d.related.slice(0, 20).forEach(v => side.append(card(v)));
  }

  setChip('…');
  box.append(el('div', 'player-msg', 'عم يجهّز الفيديو…'));
  await tryNext();
}

/* ---------------- التنقّل ---------------- */
async function route() {
  const hash = location.hash.slice(1) || '/';
  const [path, qs] = hash.split('?');
  const p = new URLSearchParams(qs || '');
  if (path !== '/watch') await destroyPlayer();
  window.scrollTo(0, 0);
  if (path === '/search' && p.get('q')) return renderSearch(p.get('q'));
  if (path === '/watch' && p.get('v')) return renderWatch(p.get('v'));
  if (path === '/channel' && p.get('id')) return renderChannel(p.get('id'));
  $('#q').value = '';
  return renderHome();
}
window.addEventListener('hashchange', route);

$('#searchForm').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (q) { $('#q').blur(); location.hash = `#/search?q=${encodeURIComponent(q)}`; }
});

/* ---------------- البداية ---------------- */
if (window.shaka) shaka.polyfill.installAll();
probeAll();
route();
