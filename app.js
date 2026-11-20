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

let instances = mergeInstances(store.get('custom', []));
let selected = store.get('selected', instances[0].url);
const health = {}; // url -> 'ok' | 'bad'

function mergeInstances(custom) {
  const all = [...DEFAULT_INSTANCES];
  for (const c of custom) if (!all.some(i => i.url === c.url)) all.push(c);
  return all;
}

/* السيرفر المختار أولاً، بعدين الشغّالين، بعدين الباقي */
function orderedInstances() {
  const rank = i => (i.url === selected ? 0 : health[i.url] === 'ok' ? 1 : health[i.url] === 'bad' ? 3 : 2);
  return [...instances].sort((a, b) => rank(a) - rank(b));
}

async function fetchJSON(url, ms = 12000) {
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

/* جرّب العملية على كل السيرفرات بالترتيب لحتى ينجح واحد */
async function withFallback(op, { skip = [] } = {}) {
  const errors = [];
  for (const inst of orderedInstances()) {
    if (skip.includes(inst.url)) continue;
    try {
      const res = await op(inst);
      health[inst.url] = 'ok';
      if (inst.url !== selected) note(`السيرفر المختار ما ردّ، استعملت ${host(inst.url)}`);
      return { inst, res };
    } catch (e) {
      health[inst.url] = 'bad';
      errors.push(`${host(inst.url)}: ${e.message || e}`);
      console.warn('[nuvio]', inst.url, e);
    }
  }
  const err = new Error('كل السيرفرات فشلت');
  err.details = errors;
  throw err;
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
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 7000);
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
async function resolveUrl(u, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
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
    box.replaceChildren();
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1`;
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    box.append(f);
    setChip('مشغّل مضمّن (nocookie)', 'warn');
  }

  async function playSources(inst, sources) {
    box.replaceChildren();
    const video = document.createElement('video');
    video.controls = true; video.autoplay = true; video.playsInline = true; video.preload = 'auto';
    box.append(video);
    msg('عم يجهّز البث…');
    video.addEventListener('playing', () => msg(''), { once: true });
    video.addEventListener('loadeddata', () => msg(''), { once: true });

    for (let s of sources) {
      try {
        if (s.kind === 'mp4') {
          await destroyPlayer();
          video.src = s.url;
          await new Promise((ok, bad) => {
            video.addEventListener('loadedmetadata', ok, { once: true });
            video.addEventListener('error', () => bad(new Error('mp4 فشل')), { once: true });
            setTimeout(() => bad(new Error('مهلة')), 15000);
          });
        } else {
          if (!window.shaka || !shaka.Player.isBrowserSupported()) throw new Error('Shaka مش متوفر');
          await destroyPlayer();
          player = new shaka.Player();
          await player.attach(video);
          player.getNetworkingEngine().registerRequestFilter(async (type, req) => {
            req.uris = await Promise.all(req.uris.map(fixUrl));
          });
          s = { ...s, url: await resolveUrl(s.url) };
          player.configure({
            preferredVideoCodecs: ['avc1', 'vp9'],
            streaming: { bufferingGoal: 30, retryParameters: { maxAttempts: 2, timeout: 15000 } },
            manifest: { retryParameters: { maxAttempts: 2, timeout: 15000 } },
          });
          await player.load(s.url);
        }
        setChip(`بث مباشر بلا إعلانات • ${s.kind.toUpperCase()}${s.label ? ' ' + s.label : ''} • ${host(inst.url)}`, 'ok');
        video.play().catch(() => { /* المتصفح ممكن يمنع التشغيل التلقائي */ });
        return true;
      } catch (e) {
        console.warn('[nuvio] source failed', s, e);
      }
    }
    return false;
  }

  async function tryNext() {
    try {
      const { inst, res } = await withFallback(i => apiFor(i).video(i.url, id), { skip: tried });
      tried.push(inst.url);
      current = { inst, data: res };
      if (!layout.isConnected) { view.replaceChildren(layout); }
      fillInfo(res);
      if (await playSources(inst, res.sources)) return;
      health[inst.url] = 'bad';
      note(`البث من ${host(inst.url)} ما اشتغل، عم جرّب غيرو…`);
      return tryNext();
    } catch (e) {
      if (!layout.isConnected) view.replaceChildren(layout);
      if (!current) info.replaceChildren(el('h1', 'v-title', 'ما قدرت جيب معلومات الفيديو'));
      if ($('#autoEmbed').checked) { note('ما في سيرفر قدر يبث، استعملت المشغّل المضمّن'); embed(); }
      else { box.replaceChildren(); msg('ما في سيرفر قدر يبث هالفيديو.'); }
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
    const other = el('button', 'btn', 'جرّب سيرفر تاني');
    other.onclick = () => { msg('عم جرّب سيرفر تاني…'); tryNext(); };
    const emb = el('button', 'btn', 'المشغّل المضمّن');
    emb.onclick = embed;
    const share = el('button', 'btn', 'انسخ الرابط الأصلي');
    share.onclick = () => navigator.clipboard?.writeText(`https://youtu.be/${id}`).then(() => note('انسخ ✓'), () => note(`https://youtu.be/${id}`));
    actions.append(other, emb, share, chip);
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

/* ---------------- الإعدادات ---------------- */
function fillSelect() {
  const sel = $('#instanceSel');
  sel.replaceChildren();
  for (const i of instances) {
    const o = el('option', null, `${host(i.url)} (${i.type})`);
    o.value = i.url; o.selected = i.url === selected; sel.append(o);
  }
}
$('#instanceSel').addEventListener('change', e => { selected = e.target.value; store.set('selected', selected); note('تم: ' + host(selected)); route(); });
$('#settingsBtn').addEventListener('click', () => { const s = $('#settings'); s.hidden = !s.hidden; });
$('#autoEmbed').checked = store.get('autoEmbed', true);
$('#autoEmbed').addEventListener('change', e => store.set('autoEmbed', e.target.checked));

$('#addBtn').addEventListener('click', () => {
  let u = $('#customUrl').value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(u)) return note('حط رابط كامل بيبلّش بـ https://');
  const custom = store.get('custom', []);
  if (!instances.some(i => i.url === u)) { custom.push({ url: u, type: $('#customType').value }); store.set('custom', custom); }
  instances = mergeInstances(custom);
  selected = u; store.set('selected', u);
  $('#customUrl').value = ''; fillSelect(); note('انضاف ✓');
});

$('#testBtn').addEventListener('click', async () => {
  const list = $('#instanceStatus');
  list.replaceChildren();
  await Promise.all(instances.map(async inst => {
    const li = el('li'); const dot = el('span', 'dot'); const txt = el('span', null, `${host(inst.url)} — عم يفحص…`);
    li.append(txt, dot); list.append(li);
    const t0 = performance.now();
    try {
      const r = await apiFor(inst).search(inst.url, 'test', 1);
      if (!r.items.length) throw new Error('بحث فاضي');
      health[inst.url] = 'ok'; dot.classList.add('ok');
      txt.textContent = `${host(inst.url)} — OK ${Math.round(performance.now() - t0)}ms`;
    } catch (e) {
      health[inst.url] = 'bad'; dot.classList.add('bad');
      txt.textContent = `${host(inst.url)} — ${e.name === 'AbortError' ? 'timeout' : e.message}`;
    }
  }));
});

/* ---------------- البداية ---------------- */
if (window.shaka) shaka.polyfill.installAll();
fillSelect();
route();
