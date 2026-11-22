/* Nuvio — ميزات إضافية: الإعدادات، النسخة الاحتياطية، «كمّل من وين وقفت»، تخطّي الدعايات جوّا الفيديو،
   فصول الفيديو، التشغيل التلقائي و«شغّل بعدين»، «مش مهتم»، علامة «جديد» عالقنوات، توفير الإنترنت، والشورتس.
   كل شي محفوظ على جهازك بس.
   (بينحمّل قبل app.js: هون بس تعريفات، وما في شي بيشتغل لحالو وقت التحميل) */
'use strict';

/* بلا زوم بإصبعين (سفاري الآيفون بيتجاهل إعداد الصفحة، فمنوقفو هون) */
['gesturestart', 'gesturechange'].forEach(n => document.addEventListener(n, e => e.preventDefault(), { passive: false }));

/* ================= الإعدادات ================= */
const PREF_DEFAULTS = { autoplay: true, sb: true, hideWatched: true, saver: 'auto', theme: 'nuvio', holdSpeed: true, holdRate: 2, shortsAuto: false, shortsRate: 1, shortsAud: '', shortsCcLang: 'ar', player: 'nuvio', homeSecs: null, preload: 'auto', cc: false, autoPip: true, floatScroll: true, hoverPreview: true, ambient: true, stableVol: false, voiceBoost: false };
const DESK_PTR = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches); // كمبيوتر بماوس
/* أقسام راس الرئيسية (فوق «مقترح لك»): الترتيب والتشغيل من الإعدادات */
const HOME_SECS = [['searches', 'سجل البحث', 'search'], ['subs', 'القنوات', 'subs'], ['hist', 'آخر اللي شفتو', 'clock']];
function homeSecs() {
  const saved = Array.isArray(prefs.get('homeSecs')) ? prefs.get('homeSecs') : [];
  const out = saved.filter(s => s && HOME_SECS.some(([k]) => k === s.k)).map(s => ({ k: s.k, on: s.on !== false }));
  for (const [k] of HOME_SECS) if (!out.some(s => s.k === k)) out.push({ k, on: true });
  return out;
}
const prefs = {
  get: k => { const p = store.get('prefs', {}); return k in p ? p[k] : PREF_DEFAULTS[k]; },
  set: (k, v) => { const p = store.get('prefs', {}); p[k] = v; store.set('prefs', p); },
};
window.nuvioPref = prefs;
/* ================= الثيم: Nuvio / نهاري / يوتيوب ================= */
const THEMES = [['nuvio', 'Nuvio', '#0b1220'], ['light', 'نهاري', '#ffffff'], ['yt', 'ألوان يوتيوب', '#0f0f0f'], ['ytui', 'واجهة يوتيوب', 'auto']];
const devLight = () => window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches;
function applyTheme(k) {
  const th = THEMES.find(x => x[0] === k) || THEMES[0];
  if (th[0] === 'nuvio') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = th[0];
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = th[2] === 'auto' ? (devLight() ? '#ffffff' : '#0f0f0f') : th[2];
}
if (window.matchMedia) matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (document.documentElement.dataset.theme === 'ytui') applyTheme('ytui'); });
const HOLD_RATES = [1.5, 2, 3];
const SPEEDS_S = [0.5, 0.75, 1, 1.25, 1.5, 2];

/* قائمة إعدادات من تحت: مفاتيح تشغيل/إيقاف، اختيارات، وأوامر */
function openPrefSheet(title, rows) {
  const ov = el('div', 'np-sheet-ov sheet-ov');
  const sh = el('div', 'np-sheet'); sh.dir = 'rtl';
  ov.append(sh);
  const close = () => {
    if (!ov.isConnected) return;
    ov.classList.remove('open');
    if (window.nuvioLockScroll) window.nuvioLockScroll(false);
    setTimeout(() => ov.remove(), 260);
  };
  const icon = k => { const s = el('span', 'np-row-ico'); s.innerHTML = window.ico ? window.ico(k) : ''; return s; };
  const main = () => {
    sh.replaceChildren(el('div', 'np-grip'));
    if (title) sh.append(el('div', 'sheet-title', title));
    rows.filter(Boolean).forEach(r => {
      const b = el('button', 'np-row');
      b.append(icon(r.icon), el('span', 'np-row-l', r.label));
      if (r.type === 'toggle') {
        const s = el('span', 'np-sw' + (r.get() ? ' on' : '')); s.append(el('span'));
        b.append(s);
        b.onclick = e => { e.stopPropagation(); r.set(!r.get()); s.classList.toggle('on', !!r.get()); };
      } else if (r.type === 'choice') {
        const cur = r.options.find(o => o[0] === r.get());
        b.append(el('span', 'np-row-v', cur ? cur[1] : ''), el('span', 'np-row-c', '‹'));
        b.onclick = e => {
          e.stopPropagation();
          sh.replaceChildren(el('div', 'np-grip'));
          const h = el('button', 'np-sub-h', '› ' + r.label); h.onclick = ev => { ev.stopPropagation(); main(); };
          sh.append(h);
          r.options.forEach(([val, label]) => {
            const o = el('button', 'np-opt' + (val === r.get() ? ' on' : ''), label);
            o.onclick = ev => { ev.stopPropagation(); r.set(val); main(); };
            sh.append(o);
          });
        };
      } else {
        b.onclick = e => { e.stopPropagation(); close(); r.fn(); };
      }
      sh.append(b);
    });
  };
  main();
  ov.onclick = e => { if (e.target === ov) close(); };
  ov.addEventListener('touchmove', e => { if (!e.target.closest('.np-sheet')) e.preventDefault(); }, { passive: false });
  document.body.append(ov);
  if (window.nuvioLockScroll) window.nuvioLockScroll(true);
  requestAnimationFrame(() => ov.classList.add('open'));
  return close;
}

const fmtT = s => {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`;
};

/* ================= كمّل من وين وقفت ================= */
const POS_MAX = 600;
const pos = {
  all: () => store.get('pos', {}),
  get(id) { const p = pos.all()[id]; return p ? { t: p[0], d: p[1], at: p[2] } : null; },
  frac(id) { const p = pos.get(id); return p && p.d > 0 ? Math.min(1, p.t / p.d) : 0; },
  set(id, t, d) {
    if (!id || !(d > 0) || !isFinite(t)) return;
    const all = pos.all();
    all[id] = [Math.round(t), Math.round(d), Date.now()];
    const keys = Object.keys(all);
    if (keys.length > POS_MAX) keys.sort((a, b) => all[a][2] - all[b][2]).slice(0, keys.length - POS_MAX).forEach(k => delete all[k]);
    store.set('pos', all);
  },
};
// منكمّل إذا وقفت بالنص (مش بأول 15 ثانية ولا بآخر 20)
function resumeAt(id) {
  const p = pos.get(id);
  if (!p || p.t < 15 || p.t > p.d - 20) return 0;
  return Math.max(0, p.t - 2);
}
// خط أحمر تحت صورة الفيديو بقدّ ما شفت منو
function progBar(id) {
  const f = pos.frac(id);
  if (f < 0.03) return null;
  const b = el('div', 'wbar'); const i = el('i');
  i.style.width = `${Math.round(f * 100)}%`;
  b.append(i);
  return b;
}
function refreshBars(root) {
  (root || document).querySelectorAll('a.card[data-vid]').forEach(c => {
    const th = c.querySelector('.thumb'); if (!th) return;
    const old = th.querySelector('.wbar'); if (old) old.remove();
    const nb = progBar(c.dataset.vid); if (nb) th.append(nb);
  });
}

/* ================= تخطّي الدعايات جوّا الفيديو (SponsorBlock) =================
   منبعت بس أول 4 حروف من «بصمة» رقم الفيديو، فالخدمة ما بتعرف شو عم تحضر. */
const SB_NAMES = { sponsor: 'دعاية', selfpromo: 'ترويج', interaction: 'تذكير بالاشتراك', music_offtopic: 'مقطع بلا موسيقى' };
async function sha256hex(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function sbSegments(id, music) {
  if (!prefs.get('sb') || !window.crypto || !crypto.subtle) return Promise.resolve([]);
  const cats = ['sponsor', 'selfpromo', 'interaction'].concat(music ? ['music_offtopic'] : []);
  return cached('sb:' + id + (music ? ':m' : ''), 30 * 60e3, async () => {
    const h = (await sha256hex(id)).slice(0, 4);
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 5000);
    try {
      const r = await fetch(`https://sponsor.ajay.app/api/skipSegments/${h}?categories=${encodeURIComponent(JSON.stringify(cats))}`, { signal: ctl.signal, referrerPolicy: 'no-referrer' });
      if (r.status === 404) return [];
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const list = await r.json();
      const v = (Array.isArray(list) ? list : []).find(x => x.videoID === id);
      return v ? v.segments
        .filter(s => (s.actionType || 'skip') === 'skip' && s.segment && s.segment[1] - s.segment[0] > 1)
        .map(s => ({ start: s.segment[0], end: s.segment[1], cat: s.category })) : [];
    } finally { clearTimeout(tm); }
  });
}

/* ================= فصول الفيديو (من الأوقات بالوصف) =================
   متل يوتيوب: أول فصل 0:00، وعالأقل 3 فصول، وبالترتيب */
function parseChapters(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/(?:^|[\s(\[])((?:\d{1,2}:)?\d{1,2}:\d{2})(?=$|[\s)\]\-–—:|.,])/);
    if (!m) continue;
    const t = durSec(m[1]);
    const title = line.replace(m[1], ' ').replace(/^[\s\-–—:|•()[\].,]+|[\s\-–—:|•()[\].,]+$/g, '').trim();
    out.push({ t, title: title.slice(0, 80) });
  }
  if (out.length < 3 || out[0].t !== 0) return [];
  for (let i = 1; i < out.length; i++) if (out[i].t <= out[i - 1].t) return [];
  return out;
}

/* ================= «شغّل بعدين» + التشغيل التلقائي ================= */
const queue = {
  list: () => store.get('later', []),
  has: id => queue.list().some(v => v.id === id),
  add(v) { const a = queue.list().filter(x => x.id !== v.id); a.push({ ...slim(v), at: Date.now() }); store.set('later', a.slice(-200)); },
  remove(id) { if (queue.has(id)) store.set('later', queue.list().filter(x => x.id !== id)); },
  toggle(v) { if (queue.has(v.id)) { queue.remove(v.id); return false; } queue.add(v); return true; },
};
let openInMini = false; // الفيديو الجاي بيكمّل بالمشغّل الصغير إذا كان مصغّر
function pickNext(curId, related, music, force) {
  if (playCtx) {
    const c = playCtx, i = c.ids.indexOf(curId);
    if (i < 0) playCtx = null; // الفيديو مش من القائمة: طلعنا من وضع القائمة
    else {
      (c.played || (c.played = new Set())).add(curId);
      if (c.shuffle) { // عشوائي: واحد ما انشاف من القائمة (ومع التكرار منبلّش دورة جديدة)
        let rest = c.items.filter(v => !c.played.has(v.id));
        if (!rest.length && c.loop) { c.played = new Set([curId]); rest = c.items.filter(v => v.id !== curId); }
        if (rest.length) return { v: rest[Math.floor(Math.random() * rest.length)], fromList: c.title };
      } else if (i + 1 < c.ids.length) return { v: c.items[i + 1], fromList: c.title };
      else if (c.loop && c.items.length > 1) return { v: c.items[0], fromList: c.title }; // كرّر القائمة: من الأول
    }
  }
  const q = queue.list().filter(v => v.id !== curId);
  if (q.length) return { v: q[0], fromQueue: true };
  if (!force && !prefs.get('autoplay')) return null;
  let all = (related || []).filter(v => v && v.id && v.id !== curId && !v.live);
  if (music && typeof isSong === 'function') { const s = all.filter(v => isSong(v, 1)); if (s.length) all = s; } // Nuvio Music: اللي بعدو أغنية، مش فيديو عادي
  const fresh = all.filter(v => wanted(v) && (music || !isWatched(v.id)));
  const v = fresh[0] || all.find(wanted) || all[0];
  return v ? { v } : null;
}
function goNext(nx) {
  if (!nx) return;
  if (nx.fromQueue) queue.remove(nx.v.id);
  preview.set(nx.v.id, nx.v);
  openInMini = !!miniOn;
  location.hash = `#/watch?v=${encodeURIComponent(nx.v.id)}${nx.fromList ? plParam() : ''}`;
}
// «الجاي» فوق الفيديو لمّا يخلص، مع عدّ تنازلي وزر إلغاء
function showUpNext(box, nx) {
  const old = box.querySelector('.np-next'); if (old) old.remove();
  const o = el('div', 'np-next'); o.dir = 'rtl';
  const head = el('div', 'np-next-t', nx.fromQueue ? 'الجاي من «شغّل بعدين»' : nx.fromList ? `الجاي من «${nx.fromList}»` : 'الفيديو الجاي');
  const row = el('div', 'np-next-row');
  const img = el('img'); img.alt = ''; img.src = ytThumb(nx.v.id);
  const tt = el('div', 'np-next-title', nx.v.title || ''); tt.dir = 'auto';
  row.append(img, tt);
  const btns = el('div', 'np-next-btns');
  const cancel = el('button', 'np-next-x', 'إلغاء');
  const play = el('button', 'np-next-go', 'شغّل هلّق');
  btns.append(cancel, play);
  const bar = el('div', 'np-next-bar'); const fill = el('i'); bar.append(fill);
  o.append(head, row, btns, bar);
  ['pointerup', 'pointerdown', 'click'].forEach(n => o.addEventListener(n, e => e.stopPropagation()));
  box.append(o);
  const tm = setTimeout(() => { o.remove(); goNext(nx); }, 6000);
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = '100%'; }));
  cancel.onclick = () => { clearTimeout(tm); o.remove(); };
  play.onclick = () => { clearTimeout(tm); o.remove(); goNext(nx); };
}

/* ================= صفحة الفيديو: وصل كل الإضافات بالمشغّل ================= */
// ctx: { id, getNp, box, music, related: () => [] }
function watchExtras(ctx) {
  const np = ctx.getNp(); if (!np) return {};
  const v = np.video;
  const media = () => (np.bgOn && np.bg ? np.bg : v);
  // ١) حفظ مكانك كل 5 ثواني، وعالإيقاف، وعالآخر
  let last = 0;
  const save = force => {
    const d = v.duration || (np.bg && np.bg.duration);
    if (!isFinite(d) || d < 30) return;
    if (!force && Date.now() - last < 5000) return;
    last = Date.now();
    pos.set(ctx.id, media().currentTime, d);
  };
  // ٢) تخطّي الدعايات
  let segs = [];
  const skip = () => {
    if (!segs.length) return;
    const m = media(), t = m.currentTime;
    for (const s of segs) if (!s.done && t >= s.start && t < s.end - 0.4) {
      s.done = true; m.currentTime = s.end;
      note(`تخطّينا ${SB_NAMES[s.cat] || 'دعاية'} ✓`);
      break;
    }
  };
  // ٣) آخر الفيديو: الجاي
  const ended = () => {
    const d = v.duration; if (isFinite(d)) pos.set(ctx.id, d, d);
    if (np.dead || np.loop || (typeof sleepState !== 'undefined' && sleepState.endOfVideo)) return;
    const nx = pickNext(ctx.id, ctx.related(), ctx.music);
    if (!nx) return;
    if (document.hidden || miniOn) goNext(nx); else showUpNext(ctx.box, nx);
  };
  const wire = m => {
    m.addEventListener('timeupdate', () => { save(); skip(); });
    m.addEventListener('pause', () => save(true));
    m.addEventListener('ended', ended);
  };
  wire(v);
  ctx.box.addEventListener('npbg', e => { if (e.detail) wire(e.detail); });
  sbSegments(ctx.id, ctx.music).then(s => {
    if (np.dead || !s.length) return;
    segs = s;
    np.setMarks(s);
  }).catch(() => {});
  return {
    chapters(desc) { const ch = parseChapters(desc); if (ch.length) np.setChapters(ch); },
  };
}

/* ================= «مش مهتم» + خبّي اللي شفتو ================= */
let nopeCache = null, nopeVer = '';
function nopeSets() {
  const ver = liveVer(['nope', 'nopeCh']);
  if (!nopeCache || ver !== nopeVer) { nopeVer = ver; nopeCache = { ids: new Set(store.get('nope', [])), ch: new Set(store.get('nopeCh', [])) }; }
  return nopeCache;
}
function addNope(k, id) {
  if (!id) return;
  const a = store.get(k, []).filter(x => x !== id); a.unshift(id);
  store.set(k, a.slice(0, 2000));
}
const wanted = v => { if (!v || !v.id) return false; const n = nopeSets(); return !n.ids.has(v.id) && !(v.authorId && n.ch.has(v.authorId)); };
let watchedCache = null, watchedVer = '';
function isWatched(id) {
  const ver = liveVer(['hist', 'mhist', 'pos']);
  if (!watchedCache || ver !== watchedVer) {
    watchedVer = ver;
    watchedCache = new Set(lib.list('hist').concat(lib.list('mhist')).map(v => v.id));
    const all = pos.all();
    for (const k in all) if (all[k][1] > 0 && all[k][0] / all[k][1] > 0.85) watchedCache.add(k);
  }
  return watchedCache.has(id);
}
// للمقترحات: مش «مش مهتم»، وإذا الخيار شغّال، مش شي شفتو
const suggestOk = v => wanted(v) && !(prefs.get('hideWatched') && isWatched(v.id));
function hideCards(sel) {
  document.querySelectorAll(sel).forEach(c => {
    c.style.transition = 'opacity .25s, transform .25s'; c.style.opacity = '0'; c.style.transform = 'scale(.96)';
    setTimeout(() => c.remove(), 260);
  });
}

/* ================= قائمة سفلية عامة (⋮ عالفيديو، إلخ) ================= */
function openSheet(title, items) {
  const ov = el('div', 'np-sheet-ov sheet-ov');
  const sh = el('div', 'np-sheet'); sh.dir = 'rtl';
  sh.append(el('div', 'np-grip'));
  if (title) { const h = el('div', 'sheet-title', title); h.dir = 'auto'; sh.append(h); }
  const close = () => {
    if (!ov.isConnected) return;
    ov.classList.remove('open');
    if (window.nuvioLockScroll) window.nuvioLockScroll(false);
    setTimeout(() => ov.remove(), 260);
  };
  items.filter(Boolean).forEach(([ic, label, fn]) => {
    const b = el('button', 'np-row');
    const i = el('span', 'np-row-ico'); i.innerHTML = window.ico ? window.ico(ic) : '';
    b.append(i, el('span', 'np-row-l', label));
    b.onclick = e => { e.stopPropagation(); close(); fn(); };
    sh.append(b);
  });
  ov.append(sh);
  ov.onclick = e => { if (e.target === ov) close(); };
  ov.addEventListener('touchmove', e => { if (!e.target.closest('.np-sheet')) e.preventDefault(); }, { passive: false });
  document.body.append(ov);
  if (window.nuvioLockScroll) window.nuvioLockScroll(true);
  requestAnimationFrame(() => ov.classList.add('open'));
  return close;
}
function shareVideo(v) {
  const url = `https://youtu.be/${v.id}`;
  if (navigator.share) navigator.share({ title: v.title || '', url }).catch(() => {});
  else (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => note('انسخ الرابط ✓'), () => note(url));
}
function cardMenu(v) {
  const author = (v.author || '').trim();
  openSheet(v.title, [
    ['later', queue.has(v.id) ? 'شيل من «شغّل بعدين»' : 'شغّل بعدين', () => note(queue.toggle(v) ? 'انضاف لـ«شغّل بعدين» ✓' : 'انشال من «شغّل بعدين»')],
    ['saved', lib.has('favs', v.id) ? 'شيل من المحفوظة' : 'حفظ', () => note(lib.toggle('favs', v) ? 'انحفظ ✓' : 'انشال من المحفوظة')],
    ['list', 'ضيف لقائمة تشغيل', () => addToPlaylist(v)],
    ['share', 'مشاركة', () => shareVideo(v)],
    ['laptop', 'شغّل على جهاز تاني', () => openCastSheet({ id: v.id, title: v.title, t: 0 })],
    ['ban', 'مش مهتم', () => { addNope('nope', v.id); hideCards(`a.card[data-vid="${CSS.escape(v.id)}"]`); note('تمام، ما رح نقترحلك ياه'); }],
    v.authorId && author ? ['userx', `ما تقترحلي «${author.slice(0, 30)}»`, () => {
      addNope('nopeCh', v.authorId); hideCards(`a.card[data-ch="${CSS.escape(v.authorId)}"]`);
      note(`ما رح تشوف «${author.slice(0, 30)}» بالمقترحات`);
    }] : null,
  ]);
}

/* ================= علامة «جديد» عالقنوات المشترك فيها =================
   منتذكّر آخر فيديو شفناه بكل قناة؛ إذا نزل فيديو أحدث بتطلع نقطة. بلا إشعارات. */
const chNew = {
  tops: () => store.get('chTop', {}),
  seen: () => store.get('chSeen', {}),
  has(id) { const t = chNew.tops()[id], s = chNew.seen()[id]; return !!(t && t.top && s && t.top !== s); },
  markSeen(id, top) {
    if (!id || !top) return;
    const s = chNew.seen(); if (s[id] !== top) { s[id] = top; store.set('chSeen', s); }
    const t = chNew.tops(); if (!t[id] || t[id].top !== top) { t[id] = { top, at: Date.now() }; store.set('chTop', t); }
  },
};
let chRefreshing = false;
async function refreshChannelTops(force) {
  if (chRefreshing || !ytiUsable() || !subs.list().length) return;
  if (!force && Date.now() - store.get('chTopAt', 0) < 30 * 60e3) return;
  chRefreshing = true;
  store.set('chTopAt', Date.now());
  ytiBypass++; // الجديد من يوتيوب، مش المحفوظ
  try {
    const list = subs.list().slice(0, 40);
    const tops = chNew.tops(), seen = chNew.seen();
    // الجرس: آخر فيديوهات القنوات (أول مرة منعتبرها قديمة، بلا ما يطلع رقم كبير)
    const bellFirst = !store.get('bell', null);
    const bell = new Map(store.get('bell', []).map(v => [v.id, v]));
    let bellChanged = false;
    let changed = false;
    for (let i = 0; i < list.length; i += 3) {
      await Promise.all(list.slice(i, i + 3).map(c => getChannel(c.id).then(({ res }) => {
        const top = res && res.items && res.items[0] && res.items[0].id;
        if (!top) return;
        const chFirst = bellFirst || !(c.id in seen);
        for (const v of res.items.slice(0, 3)) {
          if (!v || !v.id || v.short || bell.has(v.id)) continue;
          bell.set(v.id, { ...slim(v), ts: v.ts || 0, ch: c.id, seenAt: chFirst ? 0 : Date.now() });
          bellChanged = true;
        }
        if (!tops[c.id] || tops[c.id].top !== top) { tops[c.id] = { top, at: Date.now() }; changed = true; }
        if (!(c.id in seen)) { seen[c.id] = top; changed = true; } // أول مرة: هيدا الأساس، بلا نقطة
      }).catch(() => {})));
    }
    if (changed) { store.set('chSeen', seen); store.set('chTop', tops); }
    if (bellChanged || bellFirst) store.set('bell', [...bell.values()].sort((a, b) => (b.seenAt - a.seenAt) || ((b.ts || 0) - (a.ts || 0))).slice(0, 60));
  } finally { chRefreshing = false; ytiBypass--; }
}
setInterval(() => refreshChannelTops(), 31 * 60e3); // وانت فاتح الموقع: كل نص ساعة منشوف إذا في جديد

/* ================= الجرس 🔔: فيديوهات جديدة من القنوات اللي مشترك فيها =================
   (عالجهاز نفسو، بلا سيرفر: بيتحدّث لمّا تفتح الموقع وكل نص ساعة) */
const bellNew = () => { const seenAt = store.get('bellSeen', 0); return store.get('bell', []).filter(v => v.seenAt > seenAt); };
function bellInit() {
  const menu = document.getElementById('menuBtn'); if (!menu || document.getElementById('bellBtn')) return;
  const b = document.createElement('button');
  b.id = 'bellBtn'; b.className = 'icon-btn bell-btn'; b.setAttribute('aria-label', 'الفيديوهات الجديدة'); b.title = 'الفيديوهات الجديدة من اشتراكاتك';
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15zM10 21h4"/></svg><span class="bell-n" hidden></span>';
  menu.before(b);
  const badge = b.querySelector('.bell-n');
  const draw = () => { const n = bellNew().length; badge.hidden = !n; badge.textContent = n > 9 ? '+9' : String(n); };
  draw();
  window.addEventListener('nuvio:store', e => { if (e.detail === 'bell' || e.detail === 'bellSeen') draw(); });
  b.onclick = e => { e.stopPropagation(); bellPanel(b); };
}
function bellPanel(btn) {
  const old = document.querySelector('.bell-pop'); if (old) { old.remove(); return; }
  const fresh = new Set(bellNew().map(v => v.id));
  const pop = el('div', 'bell-pop'); pop.dir = 'rtl';
  const head = el('div', 'bell-h');
  const rf = el('button', 'bell-rf', 'حدّث'); rf.onclick = async e => { e.stopPropagation(); rf.disabled = true; rf.textContent = 'عم دوّر…'; await refreshChannelTops(true).catch(() => {}); pop.remove(); bellPanel(btn); };
  head.append(el('b', null, 'الجديد من اشتراكاتك'), rf);
  const list = el('div', 'bell-list');
  const items = store.get('bell', []);
  if (!subs.list().length) list.append(el('div', 'bell-empty', 'اشترك بقنوات لتوصلك فيديوهاتها الجديدة هون.'));
  else if (!items.length) list.append(el('div', 'bell-empty', 'لسّا ما في شي جديد. اكبس «حدّث».'));
  items.slice(0, 40).forEach(v => {
    const a = el('a', 'bell-i' + (fresh.has(v.id) ? ' new' : '')); a.href = `#/watch?v=${encodeURIComponent(v.id)}`;
    a.onclick = () => { preview.set(v.id, v); pop.remove(); };
    const im = el('img'); im.alt = ''; im.loading = 'lazy'; im.src = v.thumb || ytThumb(v.id);
    const tx = el('span', 'bell-tx'); const t = el('span', 'bell-t', v.title || ''); t.dir = 'auto';
    tx.append(t, el('span', 'bell-s', [v.author, v.published].filter(Boolean).join(' · ')));
    a.append(el('i', 'bell-dot'), tx, im);
    list.append(a);
  });
  pop.append(head, list);
  ['pointerdown', 'click'].forEach(n => pop.addEventListener(n, e => e.stopPropagation()));
  document.body.append(pop);
  const close = () => { pop.remove(); document.removeEventListener('click', close); };
  setTimeout(() => document.addEventListener('click', close), 0);
  store.set('bellSeen', Date.now()); // شفتهن
}
// بعد ما يخلص تحميل كل الملفات (store وغيرو من app.js)
if (document.readyState === 'complete') setTimeout(bellInit, 0); else document.addEventListener('DOMContentLoaded', bellInit);

/* ================= توفير الإنترنت =================
   تلقائي: إذا المتصفح بيعرف إنك على بيانات الموبايل (أندرويد/كروم). الآيفون ما بيقول، فاختار «دايماً» يدوي. */
function saverOn() {
  const m = prefs.get('saver');
  if (m === 'on') return true;
  if (m === 'off') return false;
  const c = navigator.connection;
  return !!(c && (c.saveData || c.type === 'cellular' || /(^|-)(2g|3g)$/.test(c.effectiveType || '')));
}
window.nuvioSaver = saverOn;
/* تحميل مسبق قوي (كم دقيقة لقدّام): بس إذا اخترت «دايماً».
   «تلقائي» = ذكي: المخزون قدّام على قد ما الشبكة بدها (شوف smartBuffer) — هيك ما بيروح نت عالفاضي إذا طلعت من الفيديو بكّير */
function strongPreload() {
  const m = prefs.get('preload');
  if (m === 'off' || saverOn()) return false;
  return m === 'on';
}
window.nuvioStrong = strongPreload;
/* ================= الجودة الذكية =================
   الجودة على قد المشغّل نفسو عالشاشة (مش قد الشاشة كلها): الفيديو بالصفحة عالتلفون 480p (أوضح من 360p تبع يوتيوب)،
   وبملء الشاشة بتطلع لحالها لـ 1080p. ما منحمّل 720p/1080p لمربّع صغير ما رح تبيّن فيه الفرق — هيك بتوفّر نص النت.
   كل ما يتغيّر حجم المشغّل (ملء الشاشة، تدوير، مشغّل صغير) منعيد الحساب. */
function viewPixels(v) {
  const dpr = window.devicePixelRatio || 1;
  const fs = document.fullscreenElement || document.webkitFullscreenElement || (v && v.webkitDisplayingFullscreen);
  let w = 0, h = 0;
  if (v && !fs) { const r = v.getBoundingClientRect(); w = r.width; h = r.height; }
  if (w < 40 || h < 40) { w = (fs ? screen.width : innerWidth) || 0; h = (fs ? screen.height : innerHeight) || 0; } // مش ظاهر لسّا: قد النافذة
  if (!w || !h) return Infinity;
  const ar = v && v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9;
  const fit = w / h > ar ? h * h * ar : w * w / ar; // مساحة الفيديو جوّا المربّع (بلا الحواف السودا)
  return fit * dpr * dpr;
}
// بالـ TV أو شاشة كبيرة: الحدّ بيطلع لحالو (المساحة أكبر)
const saverCfg = v => {
  if (!v && window.__nuvioNp && window.__nuvioNp.video && window.__nuvioNp.video.isConnected) v = window.__nuvioNp.video;
  const px = viewPixels(v);
  const sv = saverOn();
  // قد العرض (+١٠٪): مشغّل التلفون (608 سطر) → 480p، ملء الشاشة (1080) → 1080p.
  // توفير (داتا الموبايل): ٦٠٪ من العرض → 360p بالصفحة (متل يوتيوب)، و480p بملء الشاشة كحد أقصى
  let max = isFinite(px) ? Math.max(px * (sv ? 0.6 : 1.1), 230e3) : Infinity;
  if (sv) max = Math.min(max, 430e3);
  return { abr: { restrictions: { maxWidth: Infinity, maxHeight: Infinity, maxPixels: max } } };
};
window.nuvioQualityCfg = saverCfg;
/* سرعة النت اللي شفناها آخر مرة (متوسط متحرّك): الفيديو الجاي بيبلّش بالجودة الصح من أول ثانية، بلا ما يبلّش ضعيف ويطلع */
// لكل نوع شبكة لحالو (واي فاي / موبايل): سرعة البيت ما بتنفع لمّا تطلع عالداتا
const bwKey = () => 'nuvio:bw:' + ((navigator.connection && navigator.connection.type) || 'x');
function learnedBw() {
  try { const s = JSON.parse(localStorage.getItem(bwKey()) || 'null'); if (s && s.v > 0 && Date.now() - s.at < 3 * 86400e3) return s.v; } catch { /* */ }
  return 0;
}
function learnBw(bps) {
  if (!(bps > 1e5) || !isFinite(bps)) return;
  const old = learnedBw();
  const v = old ? old * 0.6 + bps * 0.4 : bps;
  try { localStorage.setItem(bwKey(), JSON.stringify({ v: Math.round(v), at: Date.now() })); } catch { /* */ }
}
// تقدير البداية: اللي تعلّمناه، بس مش أكتر من اللي المتصفح شايفو هلّق (downlink)؛ وبنسبة ٤٠٪ لحتى أول قطعة توصل بأقل من ثانية
function startBw() {
  let b = learnedBw() || 3e6;
  const c = navigator.connection;
  if (c && c.downlink > 0) b = Math.min(b, c.downlink * 1e6);
  return Math.min(Math.max(b * 0.4, 5e5), 5e6);
}
window.nuvioLearnedBw = learnedBw;
window.nuvioLearnBw = learnBw;
window.nuvioStartBw = startBw;
/* المخزون قدّام الذكي: على قد ما الشبكة بدها.
   شبكة أسرع بكتير من الفيديو → ٣٠ ثانية بتكفي (بترجع تتعبّى بلحظة). شبكة على قدّها أو صار تقطيع → أكتر.
   «تحميل مسبق: دايماً» → كم دقيقة متل قبل. «أبداً» → الحد الأدنى. */
function smartBuffer(bitrate, est, stalls) {
  const m = prefs.get('preload');
  if (m === 'on' && !saverOn()) return Math.max(45, Math.min(240, Math.floor(70e6 * 8 / bitrate)));
  if (m === 'off') return 20;
  const ratio = est && bitrate ? est / bitrate : 2;
  let goal = ratio >= 5 ? 40 : ratio >= 2.5 ? 60 : ratio >= 1.4 ? 90 : 120;
  if (saverOn()) goal = Math.min(goal, 45); // داتا الموبايل: أقل احتياط (إذا طلعت من الفيديو، ما بيروح نت عالفاضي)
  if (stalls) goal = Math.max(goal, Math.min(180, 90 + (stalls - 1) * 30)); // تقطّع؟ منكبّر الاحتياط فوراً
  return Math.min(goal, Math.max(30, Math.floor(50e6 * 8 / bitrate))); // ما منعدّي ~50MB بذاكرة التشغيل
}
window.nuvioSmartBuffer = smartBuffer;
/* الترميز: VP9 بيوفّر ~٣٠-٤٠٪ نت بنفس الدقة (يوتيوب نفسو بيستعملو) — بس منختارو إذا جهازك بيفكّو بالهاردوير
   (ما بيسخّن التلفون ولا بيصرف بطارية). غير هيك H.264 (avc1) متل قبل. الجواب بينحفظ للفتحة الجاية. */
let vp9Hw = (() => { try { return JSON.parse(localStorage.getItem('nuvio:vp9hw') || 'null'); } catch { return null; } })();
try {
  if (navigator.mediaCapabilities && navigator.mediaCapabilities.decodingInfo) {
    navigator.mediaCapabilities.decodingInfo({ type: 'media-source', video: { contentType: 'video/webm; codecs="vp09.00.31.08"', width: 1280, height: 720, bitrate: 1500000, framerate: 30 } })
      .then(r => { vp9Hw = !!(r && r.supported && r.smooth && r.powerEfficient); try { localStorage.setItem('nuvio:vp9hw', JSON.stringify(vp9Hw)); } catch { /* */ } })
      .catch(() => {});
  }
} catch { /* */ }
window.nuvioCodecs = () => {
  let o = ''; try { o = localStorage.getItem('nuvio:codec') || ''; } catch { /* */ } // للتجربة: avc1 / vp9 إجباري
  if (o === 'avc1') return ['avc1', 'vp9'];
  if (o === 'vp9') return ['vp9', 'avc1'];
  return vp9Hw ? ['vp9', 'avc1'] : ['avc1', 'vp9'];
};

/* ================= النسخة الاحتياطية ================= */
const BACKUP_KEYS = ['playlists', 'hist', 'likes', 'favs', 'mhist', 'subs', 'artists', 'ytlists', 'searches', 'later', 'pos', 'nope', 'nopeCh', 'chSeen', 'chTop', 'prefs', 'mode'];
function exportBackup() {
  const data = {};
  for (const k of BACKUP_KEYS) { const v = store.get(k, null); if (v != null) data[k] = v; }
  const player = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('nuvio:p:')) try { player[k.slice(8)] = JSON.parse(localStorage.getItem(k)); } catch { /* */ }
  }
  const json = JSON.stringify({ app: 'nuvio', v: 1, at: new Date().toISOString(), data, player });
  const name = `nuvio-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const file = typeof File === 'function' ? new File([blob], name, { type: 'application/json' }) : null;
  if (ios && file && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: name }).then(() => note('انحفظت النسخة ✓'), () => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  note('نزلت النسخة الاحتياطية ✓');
}
function importBackup() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j || j.app !== 'nuvio' || !j.data) { note('هاد مش ملف نسخة احتياطية من Nuvio'); return; }
      const n = mergeBackup(j);
      note(`رجّعنا بياناتك ✓ (${nf.format(n)} شي جديد)`);
    } catch { note('ما قدرت اقرأ الملف'); }
  };
  inp.click();
}
// دمج (مش استبدال): اللي عندك بيضل، واللي بالملف بينضاف
function mergeBackup(j) {
  const d = j.data; let n = 0;
  const arrById = (k, max) => {
    if (!Array.isArray(d[k])) return;
    const cur = store.get(k, []);
    const have = new Set(cur.map(x => x && x.id));
    const add = d[k].filter(x => x && x.id && !have.has(x.id));
    if (!add.length) return;
    n += add.length;
    let merged = cur.concat(add);
    if (merged.some(x => x.at)) merged.sort((a, b) => (b.at || 0) - (a.at || 0));
    store.set(k, max ? merged.slice(0, max) : merged);
  };
  arrById('playlists'); arrById('hist', 500); arrById('mhist', 500); arrById('likes'); arrById('favs'); arrById('subs'); arrById('artists'); arrById('ytlists');
  if (Array.isArray(d.later)) { const cur = queue.list(); const have = new Set(cur.map(x => x.id)); const add = d.later.filter(x => x && x.id && !have.has(x.id)); if (add.length) { n += add.length; store.set('later', cur.concat(add).slice(-200)); } }
  if (Array.isArray(d.searches)) { const cur = store.get('searches', []); const low = new Set(cur.map(s => String(s).toLowerCase())); const add = d.searches.filter(s => typeof s === 'string' && !low.has(s.toLowerCase())); if (add.length) { n += add.length; store.set('searches', cur.concat(add).slice(0, 40)); } }
  for (const k of ['nope', 'nopeCh']) if (Array.isArray(d[k])) { const cur = store.get(k, []); const set = new Set(cur); const add = d[k].filter(x => !set.has(x)); if (add.length) store.set(k, cur.concat(add).slice(0, 2000)); }
  for (const k of ['pos', 'chSeen', 'chTop']) if (d[k] && typeof d[k] === 'object') store.set(k, { ...d[k], ...store.get(k, {}) });
  if (d.prefs && typeof d.prefs === 'object') store.set('prefs', { ...d.prefs, ...store.get('prefs', {}) });
  if (j.player && typeof j.player === 'object') for (const [k, v] of Object.entries(j.player)) if (localStorage.getItem('nuvio:p:' + k) == null) try { localStorage.setItem('nuvio:p:' + k, JSON.stringify(v)); } catch { /* */ }
  return n;
}

/* المنصة اللي بتفتح أول شي: تطبيق أندرويد (1.0.5+) بيحفظها عندو، لحتى يعرف يفتح يوتيوب أو لأ قبل ما يحمّل الموقع */
function appStartSync() {
  if (!document.documentElement.hasAttribute('data-nuvio-yt')) return;
  try { window.NuvioApp.postMessage('start:' + (prefs.get('startSec') || 'auto')); } catch { /* */ }
}
/* ================= القائمة الجانبية: الإعدادات والنسخة الاحتياطية ================= */
function drawerSettings(d, sep, closeDrawerFn) {
  const sw = (icon, label, get, set, hint) => {
    const b = el('button', 'drawer-item drawer-tg');
    const ic = el('span', 'drawer-ico'); ic.innerHTML = window.ico ? window.ico(icon) : '';
    const tx = el('span', 'drawer-tx'); tx.append(el('span', null, label)); if (hint) tx.append(el('small', 'muted', hint));
    const s = el('span', 'np-sw' + (get() ? ' on' : '')); s.append(el('span'));
    b.append(ic, tx, s);
    b.onclick = () => { set(!get()); s.classList.toggle('on', get()); };
    return b;
  };
  const act = (icon, label, fn) => {
    const b = el('button', 'drawer-item');
    const ic = el('span', 'drawer-ico'); ic.innerHTML = window.ico ? window.ico(icon) : '';
    b.append(ic, el('span', null, label));
    b.onclick = () => { closeDrawerFn(); fn(); };
    return b;
  };
  const SAVER = { auto: 'تلقائي', on: 'دايماً', off: 'أبداً' };
  const saverBtn = el('button', 'drawer-item');
  const sic = el('span', 'drawer-ico'); sic.innerHTML = window.ico ? window.ico('wifi') : '';
  const sval = el('span', 'drawer-count', SAVER[prefs.get('saver')] || 'تلقائي');
  const stx = el('span', 'drawer-tx'); stx.append(el('span', null, 'توفير الإنترنت'), el('small', 'muted', 'على بيانات الموبايل: 360p بالصفحة و480p بملء الشاشة'));
  saverBtn.append(sic, stx, sval);
  saverBtn.onclick = () => {
    const order = ['auto', 'on', 'off'];
    const nx = order[(order.indexOf(prefs.get('saver')) + 1) % 3];
    prefs.set('saver', nx); sval.textContent = SAVER[nx];
    if (typeof player !== 'undefined' && player) try { player.configure(saverCfg()); } catch { /* */ }
  };
  const PRE = { auto: 'ذكي', on: 'دايماً', off: 'أبداً' };
  const preBtn = el('button', 'drawer-item');
  const pic = el('span', 'drawer-ico'); pic.innerHTML = window.ico ? window.ico('download') : '';
  const pval = el('span', 'drawer-count', PRE[prefs.get('preload')] || PRE.auto);
  const ptx = el('span', 'drawer-tx'); ptx.append(el('span', null, 'تحميل مسبق'), el('small', 'muted', 'ذكي: على قد ما شبكتك بدها · دايماً: كم دقيقة لقدّام'));
  preBtn.append(pic, ptx, pval);
  preBtn.onclick = () => { const order = ['auto', 'on', 'off']; const nx = order[(order.indexOf(prefs.get('preload') || 'auto') + 1) % 3]; prefs.set('preload', nx); pval.textContent = PRE[nx]; };
  const TVM = { auto: 'تلقائي', on: 'دايماً', off: 'أبداً' };
  const tvBtn = el('button', 'drawer-item');
  const tvic = el('span', 'drawer-ico'); tvic.innerHTML = window.ico ? window.ico('subs') : '';
  const tvval = el('span', 'drawer-count', TVM[prefs.get('tvMode') || 'auto']);
  const tvtx = el('span', 'drawer-tx'); tvtx.append(el('span', null, 'وضع التلفزيون'), el('small', 'muted', 'واجهة كبيرة وتنقّل بالريموت'));
  tvBtn.append(tvic, tvtx, tvval);
  tvBtn.onclick = () => { const order = ['auto', 'on', 'off']; const nx = order[(order.indexOf(prefs.get('tvMode') || 'auto') + 1) % 3]; tvval.textContent = TVM[nx]; setTVMode(nx); };
  // المشغّل الأساسي: مشغّلنا (بلا إعلانات) أو يوتيوب بواجهتنا (التشغيل من جهازك)
  const PLY = { nuvio: 'تلقائي', yt: 'يوتيوب' };
  const plBtn = el('button', 'drawer-item');
  const plic = el('span', 'drawer-ico'); plic.innerHTML = window.ico ? window.ico('play') : '';
  const plval = el('span', 'drawer-count', PLY[prefs.get('player')] || PLY.nuvio);
  const pltx = el('span', 'drawer-tx'); pltx.append(el('span', null, 'المشغّل الأساسي'), el('small', 'muted', 'تلقائي: سيرفرنا، وإذا ما زبط يوتيوب على جهازك فوراً'));
  plBtn.append(plic, pltx, plval);
  plBtn.onclick = () => { const nx = prefs.get('player') === 'yt' ? 'nuvio' : 'yt'; prefs.set('player', nx); plval.textContent = PLY[nx]; note(nx === 'yt' ? 'الفيديوهات الجاية من يوتيوب (بواجهتنا)' : 'تلقائي: سيرفرنا أول، وإذا ما زبط يوتيوب'); };
  // أول ما تفتح البرنامج: Nuvio ولا Nuvio Music (ولا يوتيوب، جوّا تطبيق أندرويد)
  const inApp = document.documentElement.hasAttribute('data-nuvio-yt');
  const STS = inApp ? { auto: 'متل آخر مرة', video: 'Nuvio', music: 'Nuvio Music', yt: 'يوتيوب' } : { video: 'Nuvio', music: 'Nuvio Music' };
  const stKey = () => { const k = prefs.get('startSec') || 'auto'; return k in STS ? k : (inApp ? 'auto' : 'video'); };
  const startBtn = el('button', 'drawer-item');
  const stic = el('span', 'drawer-ico'); stic.innerHTML = window.ico ? window.ico('home') : '';
  const stval = el('span', 'drawer-count', STS[stKey()]);
  const sttx = el('span', 'drawer-tx'); sttx.append(el('span', null, 'أول ما تفتح البرنامج'), el('small', 'muted', inApp ? 'شو بيفتح أول شي: Nuvio، الموسيقى، أو يوتيوب' : 'شو بيفتح أول شي: الفيديوهات ولا الموسيقى'));
  startBtn.append(stic, sttx, stval);
  startBtn.onclick = () => {
    const order = Object.keys(STS);
    const nx = order[(order.indexOf(stKey()) + 1) % order.length];
    prefs.set('startSec', nx); stval.textContent = STS[nx];
    appStartSync();
  };
  const hidden = store.get('nope', []).length + store.get('nopeCh', []).length;
  // المظهر: 3 ثيمات
  const themeRow = el('div', 'drawer-item theme-row');
  const tic = el('span', 'drawer-ico'); tic.innerHTML = window.ico ? window.ico('sun') : '';
  themeRow.append(tic, el('span', null, 'المظهر'));
  const seg = el('div', 'theme-seg');
  THEMES.forEach(([k, label]) => {
    const b = el('button', prefs.get('theme') === k ? 'on' : '');
    b.append(el('span', 'theme-dot ' + k), el('span', null, label));
    b.onclick = () => { prefs.set('theme', k); applyTheme(k); seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
    seg.append(b);
  });
  themeRow.append(seg);
  // سرعة الضغط المطوّل (بتتبدّل بكل كبسة)
  const rateBtn = el('button', 'drawer-item');
  const ric = el('span', 'drawer-ico'); ric.innerHTML = window.ico ? window.ico('bolt') : '';
  const rval = el('span', 'drawer-count', `${prefs.get('holdRate')}×`);
  const rtx = el('span', 'drawer-tx'); rtx.append(el('span', null, 'سرعة الضغط المطوّل'), el('small', 'muted', 'قدّيش بيسرّع الفيديو والشورتس'));
  rateBtn.append(ric, rtx, rval);
  rateBtn.onclick = () => { const i = HOLD_RATES.indexOf(+prefs.get('holdRate')); const nx = HOLD_RATES[(i + 1) % HOLD_RATES.length]; prefs.set('holdRate', nx); rval.textContent = `${nx}×`; };
  const rows = [
    themeRow,
    startBtn,
    sep('الإعدادات'),
    plBtn,
    sw('bolt', 'ضغطة مطوّلة = تسريع', () => prefs.get('holdSpeed'), v => prefs.set('holdSpeed', v), 'اضغط على الفيديو وضلّك ضاغط'),
    rateBtn,
    sw('play', 'تشغيل تلقائي', () => prefs.get('autoplay'), v => prefs.set('autoplay', v), 'لمّا يخلص الفيديو بيبلّش اللي بعدو'),
    sw('skip', 'تخطّي الدعايات جوّا الفيديو', () => prefs.get('sb'), v => prefs.set('sb', v), 'بخدمة SponsorBlock المجانية'),
    sw('subs', 'الترجمة (CC)', () => !!prefs.get('cc'), v => prefs.set('cc', v), 'مطفية بالأساس — بتقدر تشغّلها من إعدادات الفيديو كمان'),
    sw('eye', 'خبّي اللي شفتو من المقترحات', () => prefs.get('hideWatched'), v => prefs.set('hideWatched', v)),
    // آيفون: سكربت الصوت بالخلفية (Userscripts)
    /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      ? act('phones', document.documentElement.hasAttribute('data-nuvio-gm') ? 'صوت بالخلفية: السكربت شغّال ✓'
        : navigator.standalone ? 'صوت بالخلفية: افتح Nuvio من سفاري' : 'صوت بالخلفية عالآيفون (ركّب السكربت)', () => { location.href = 'ios.html'; })
      : null,
    // كمبيوتر: الفيديو الصغير والنافذة العايمة
    DESK_PTR ? sw('eye', 'معاينة لمّا تمرّق الماوس', () => prefs.get('hoverPreview') !== false, v => prefs.set('hoverPreview', v), 'الفيديو بيشتغل بلا صوت مكان الصورة') : null,
    !DESK_PTR ? sw('eye', 'معاينة بالضغطة المطوّلة', () => prefs.get('holdPreview') !== false, v => prefs.set('holdPreview', v), 'اضغط على فيديو بالصفحة وضلّك ضاغط: بيشتغل بلا صوت') : null,
    DESK_PTR ? sw('play', 'فيديو صغير لمّا تنزل بالصفحة', () => prefs.get('floatScroll') !== false, v => prefs.set('floatScroll', v), 'بيطلع عالطرف، وبتقدر تسحبو وتكبّرو من زواياه') : null,
    DESK_PTR && window.documentPictureInPicture ? sw('later', 'نافذة عايمة لمّا تروح لتبويب تاني', () => prefs.get('autoPip') !== false, v => prefs.set('autoPip', v), 'الفيديو بيضل ظاهر فوق كل شي، حتى ببرامج تانية') : null,
    saverBtn,
    preBtn,
    tvBtn,
    hidden ? act('ban', `رجّع اللي خبّيتو (${nf.format(hidden)})`, () => { store.set('nope', []); store.set('nopeCh', []); note('رجعوا كلهن للمقترحات'); }) : null,
    sep('بياناتك'),
    act('download', 'صدّر نسخة احتياطية', exportBackup),
    act('upload', 'استورد من ملف', importBackup),
  ];
  d.append(...rows.filter(Boolean));
}


/* الشورتس: الفيديو إمّا من مصدرنا (<video>) أو من مشغّل يوتيوب على جهازك (لمّا سيرفرنا محظور) — نفس الأزرار والحركات */
const SHORT_EVTS = ['timeupdate', 'ended', 'playing', 'waiting', 'pause', 'play', 'volumechange'];
class ShortMedia extends EventTarget {
  constructor(v) {
    super(); this.v = v; this.t = v; this.ym = null;
    SHORT_EVTS.forEach(n => v.addEventListener(n, () => { if (this.t === v) this.dispatchEvent(new Event(n)); }));
  }
  useYt(ym) {
    this.dropYt();
    this.ym = ym; this.t = ym;
    ym.loop = this.v.loop; ym.muted = this.v.muted; ym.playbackRate = this.v.playbackRate || 1;
    SHORT_EVTS.forEach(n => ym.addEventListener(n, () => { if (this.t === ym) this.dispatchEvent(new Event(n)); }));
  }
  dropYt() {
    const ym = this.ym; this.ym = null; this.t = this.v;
    if (ym) { if (ym._iv) clearInterval(ym._iv); try { ym.destroy(); } catch { /* */ } ym.el.remove(); }
  }
  get paused() { return this.t.paused; }
  get ended() { return this.t.ended; }
  get duration() { return this.t.duration; }
  get currentTime() { return this.t.currentTime; }
  set currentTime(x) { this.t.currentTime = x; }
  get muted() { return this.t.muted; }
  set muted(m) { this.v.muted = m; if (this.ym) { this.ym.muted = m; this.dispatchEvent(new Event('volumechange')); } }
  get volume() { return this.t.volume; }
  set volume(x) { this.v.volume = x; if (this.ym) this.ym.volume = x; }
  get loop() { return this.v.loop; }
  set loop(x) { this.v.loop = x; if (this.ym) this.ym.loop = x; }
  get playbackRate() { return this.t.playbackRate; }
  set playbackRate(r) { this.v.playbackRate = r; if (this.ym) this.ym.playbackRate = r; }
  play() { return this.t.play(); }
  pause() { return this.t.pause(); }
}

/* ================= الشورتس: مشغّل بالطول، بتنقل بسحبة ================= */
let shortsState = null;
let shortsCtx = null; // { ch, items } — من صفحة القناة
function shortsExit() {
  const s = shortsState; if (!s) return;
  shortsState = null;
  try { shJudge(s.watch); } catch { /* */ } // آخر شورت قبل ما طلعت
  try { if (s.stopBg) s.stopBg(); } catch { /* */ }
  document.body.classList.remove('shorts-mode', 'shorts-clean');
  if (s.io) s.io.disconnect();
  try { s.video.pause(); } catch { /* */ }
  try { if (s.video.dropYt) s.video.dropYt(); } catch { /* */ }
  if (s.pre) for (const m of s.pre.values()) try { m.destroy(); } catch { /* */ }
  if (s.sp) s.sp.destroy().catch(() => {});
}
// ملف DASH بمحاولة وحدة سريعة (بنفس ذاكرة المشغّل الكبير)
const mfOnce = (url, ms = 8000) => cached('mf:' + url, 4 * 60e3, async () => {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    const text = r.ok ? await r.text() : '';
    if (!text.includes('<MPD')) throw new Error('HTTP ' + r.status);
    return { text: absMpd(text, r.url || url), final: r.url || url };
  } finally { clearTimeout(tm); }
});
async function shortManifest(id) {
  // من جهازك (إضافة Nuvio Direct) — بلا سيرفرنا أبداً: إذا ما زبط، مشغّل يوتيوب مباشرة
  if (extUsable()) {
    try { return await extManifest(id); } catch (e) { if (window.YtMedia) throw e; }
  }
  // مصدرنا الخاص (سريع). إذا ما زبط ومشغّل يوتيوب متوفر، منروح عليه فوراً (بلا ما نلفّ عالسيرفرات العامة)
  else if (svUsable()) {
    try { return await mfOnce(ownMpd(id), 4000); } catch (e) { if (window.YtMedia) throw e; }
  }
  if (window.YtMedia) throw new Error('يوتيوب');
  const healthy = () => orderedInstances().filter(i => i.type === 'invidious' && health[i.url] && health[i.url].ok);
  if (!healthy().length) await Promise.race([ready, sleep(5000)]); // أول فتحة: منستنّى نعرف مين شغّال
  const ok = healthy();
  const list = (ok.length ? ok : orderedInstances().filter(i => i.type === 'invidious')).slice(0, 3);
  let err;
  for (const i of list) {
    const url = `${i.url}/api/manifest/dash/id/${id}?local=true`;
    try {
      // محاولة وحدة سريعة لكل سيرفر (بنفس ذاكرة المشغّل الكبير)
      return await cached('mf:' + url, 4 * 60e3, async () => {
        const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 8000);
        try {
          const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
          const text = r.ok ? await r.text() : '';
          if (!text.includes('<MPD')) throw new Error('HTTP ' + r.status);
          return { text, final: r.url || url };
        } finally { clearTimeout(tm); }
      });
    } catch (e) { err = e; }
  }
  throw err || new Error('ما في سيرفر');
}
// خلاصة شورتس: من يوتيوب مباشرة (فلتر «Shorts» تبع البحث)، حسب بحوثك + مواضيع عامة
async function ytShortsSearch(q) {
  const d = await yti('search', { query: q, params: ytSearchParams({}, 9) });
  const items = walk(d, 'shortsLockupViewModel').map(s => fromShort(s))
    .concat(walk(d, 'videoRenderer').map(fromVR).filter(v => v.duration > 0 && v.duration <= 75));
  return uniqById(items).filter(wanted).map(v => ({ ...v, short: true }));
}
/* ================= خوارزمية الشورتس (متل يوتيوب — وكلّها على جهازك) =================
   يوتيوب بيجيب «مرشّحين» من كذا مصدر، بيرتّبهن حسب اللي بيعجبك (قدّيش حضرت، إذا قلبت بسرعة، إعجاب، «مش مهتم»)،
   وبالآخر بيرتّب من جديد لحتى يكون في تنوّع. هون نفس الفكرة:
   - المصادر: ١) اهتماماتك (بحوثك + مواضيع الشورتس اللي عجبتك) ٢) سلسلة شورتس يوتيوب نفسها (من شورت عجبك —
     بس من جهازك: مع الإضافة أو التطبيق) ٣) قناة من قنواتك ٤) مواضيع جديدة (استكشاف).
   - الإشارات بتنحفظ على جهازك بس (shProf، ما بتنزامن): حضرت ≥80% أو رجع من الأول = عجبك، قلبت بأقل من 3 ثواني = لأ،
     إعجاب = كتير، «مش مهتم» = لأ أبداً. كل شي بيخفّ مع الوقت (نص قيمتو كل أسبوعين).
   - التنوّع: نفس القناة مرة وحدة بكل دفعة وما بترجع قبل 8 شورتس، والقنوات اللي بتقلبها دايماً بتختفي فترة.
     واللي شفتو ما بيرجع. */
const SH_EXPLORE = ['مضحك', 'طبخ', 'رياضة', 'حيوانات', 'سفر', 'كرة قدم', 'موسيقى', 'تقنية', 'funny', 'satisfying', 'ألعاب', 'gaming', 'معلومات', 'سيارات', 'رسم', 'تحدي', 'خدع', 'طبيعة', 'كوميديا', 'diy', 'science', 'football skills', 'life hacks', 'animals'];
const shProf = {
  get() { const p = store.get('shProf', null) || {}; p.ch = p.ch || {}; p.tp = p.tp || {}; p.seed = p.seed || []; p.seen = p.seen || []; return p; },
  save(p) { store.set('shProf', p); },
};
const shDecay = (x, now = Date.now()) => (x && x.s ? x.s * Math.pow(0.5, (now - (x.t || now)) / (14 * 864e5)) : 0);
function shBump(map, key, d, label, max = 300) {
  key = String(key || '').trim().toLowerCase(); if (!key) return;
  const x = map[key] || {}; x.s = Math.max(-6, Math.min(12, shDecay(x) + d)); x.t = Date.now(); if (label) x.q = label; map[key] = x;
  const ks = Object.keys(map);
  if (ks.length > max) ks.sort((a, b) => Math.abs(shDecay(map[a])) - Math.abs(shDecay(map[b]))).slice(0, ks.length - max).forEach(k => delete map[k]);
}
// هاشتاغات العنوان = مواضيع (بلا العامّة متل #shorts)
const shTags = t => (String(t || '').match(/#[\p{L}\p{N}_]{2,30}/gu) || []).map(x => x.slice(1)).filter(x => !/^(shorts?|viral|fyp|foryou|foryoupage|trending|youtubeshorts|ytshorts|subscribe|explore)$/i.test(x)).slice(0, 3);
// مفتاح القناة: اسمها — بلا «وفلان» (تعاون) وبلا الرقم بالآخر («MrBeast 2» = نفس الشخص)
const shCk = o => String((o && o.name) || '').replace(/[‎‏‪-‮]/g, '').split(/\s+(?:و|and|&|x|ft\.?|feat\.?)\s*(?=\S)|،|,/i)[0]
  .replace(/\s+\d+$/, '').replace(/\s*(official|tv|shorts|clips|edits?)$/i, '').trim().toLowerCase();
function sigAfter(ms) { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; }
// مين صاحب الشورت؟ (الاسم والعنوان) — من oembed تبع يوتيوب، مباشرة من جهازك (بيسمح لموقعنا)
const shOwner = v => (v.author ? Promise.resolve({ name: v.author, title: v.title || '' })
  : cached('oe2:' + v.id, 24 * 3600e3, () => fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/shorts/' + v.id)}`, { referrerPolicy: 'no-referrer', signal: sigAfter(3500) })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => ({ name: j.author_name || '', title: j.title || '' }))));
// سلسلة شورتس يوتيوب نفسها بعد شورت معيّن (نفس اللي بيعملو تطبيق يوتيوب لمّا تسحب) — بس من جهازك
let shSeqDown = 0;
async function ytReelSeq(seed) {
  if (!seed || typeof extUsable !== 'function' || !extUsable() || Date.now() - shSeqDown < 10 * 60e3) return [];
  try {
    // مش عبر ytDirect: إذا الإضافة/التطبيق لسّا ما بيعرفو هالعنوان، ما منعتبر الإضافة واقفة
    const r = await fetch('https://www.youtube.com/youtubei/v1/reel/reel_watch_sequence?prettyPrint=false', {
      method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', signal: sigAfter(5000),
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ context: { client: YTI_CLIENT }, sequenceParams: btoa('\x0a\x0b' + seed) }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return uniqById((j.entries || []).map(e => walk(e, 'reelWatchEndpoint')[0]).filter(x => x && x.videoId)
      .map(x => ({ id: x.videoId, title: '', author: '', duration: 0, thumb: ytThumb(x.videoId), live: false })));
  } catch { shSeqDown = Date.now(); return []; }
}
// قرعة بوزن: اللي عجبك أكتر بيطلع أكتر، بس مش دايماً نفس الشي
function shPick(list, n) {
  const l = list.slice(), out = [];
  while (out.length < n && l.length) {
    const tot = l.reduce((a, x) => a + x.w, 0); let r = Math.random() * tot, i = 0;
    while (i < l.length - 1 && (r -= l[i].w) > 0) i++;
    out.push(l.splice(i, 1)[0]);
  }
  return out;
}
// دفعة شورتس جديدة (~12). st = حالة صفحة الشورتس (لحتى نعرف شو انعرض هلّق)
function shortsFeed(st) {
  return async () => {
    const P = shProf.get(), now = Date.now();
    const cand = new Map();
    const add = (q, w) => { q = String(q || '').trim(); if (!q || q.length > 60) return; const k = q.toLowerCase(); if (shDecay(P.tp[k], now) < -2) return; cand.set(k, { q, w: Math.max(cand.has(k) ? cand.get(k).w : 0, w) }); };
    store.get('searches', []).slice(0, 8).forEach((q, i) => add(q, 1.3 - i * 0.12));
    for (const [k, x] of Object.entries(P.tp)) { const sc = shDecay(x, now); if (sc > 0.3) add(x.q || k, 0.6 + sc); }
    const interests = shPick([...cand.values()], 2).map(x => x.q);
    // استكشاف: موضوعين جداد (أو 3 إذا ما منعرف شي عنك بعد)
    const explore = shPick(SH_EXPLORE.filter(q => !cand.has(q.toLowerCase())).map(q => ({ q, w: 1 })), interests.length ? 2 : 3).map(x => x.q);
    const subsL = subs.list();
    const sub = subsL.length ? subsL[Math.floor(Math.random() * subsL.length)] : null;
    // بذرة سلسلة يوتيوب: اللي عم تحضرو هلّق، أو اللي فتحتو، أو شي عجبك مؤخراً
    const seeds = [st && st.cur && st.cur._v && st.cur._v.id, st && st.seedId, ...P.seed.slice(0, 3)].filter(Boolean);
    const seed = seeds[Math.floor(Math.random() * seeds.length)] || '';
    const tag = (l, src, q) => (l || []).map(v => ({ ...v, short: true, _src: src, _q: q || '' }));
    const intsP = Promise.all(interests.map(q => ytShortsSearch(q).then(l => tag(shuffle(l), 'int', q)).catch(() => [])));
    const [ints, exps, seqL, subL] = await Promise.all([
      intsP,
      Promise.all(explore.map(q => ytShortsSearch(q).then(l => tag(shuffle(l), 'exp', q)).catch(() => []))),
      // بلا بذرة (أول مرة): من أول شورت بنتيجة اهتماماتك
      (seed ? ytReelSeq(seed) : intsP.then(ls => ytReelSeq(((ls.flat()[0]) || {}).id))).then(l => tag(l, 'seq')),
      sub ? channelTab(sub.id, 'shorts').then(r => tag(shuffle(r.items || []).slice(0, 4).map(v => ({ ...v, author: v.author || sub.name, authorId: v.authorId || sub.id })), 'sub')).catch(() => []) : [],
    ]);
    // ورا بعض من كذا بحث (مش كلّو من بحث واحد)
    const mixL = ls => { const out = []; for (let i = 0; ls.some(l => i < l.length); i++) ls.forEach(l => { if (l[i]) out.push(l[i]); }); return out; };
    const seen = new Set(P.seen);
    const fresh = v => v && v.id && !seen.has(v.id) && !(st && st.seen && st.seen.has(v.id)) && wanted(v);
    const pools = { int: mixL(ints).filter(fresh), exp: mixL(exps).filter(fresh), seq: seqL.filter(fresh), sub: subL.filter(fresh) };
    // مين صاحب كل شورت (لحتى ما يطلع نفس الشخص ورا بعض) — بالتوازي، وبحد أقصى ~3 ثواني
    const look = Object.values(pools).flatMap(l => l.slice(0, 14)).filter(v => !v.author);
    await Promise.race([Promise.all(look.map(v => shOwner(v).then(o => { v.author = o.name; if (!v.title) v.title = o.title; }).catch(() => {}))), new Promise(r => setTimeout(r, 3000))]);
    // الدفعة: اهتماماتك تقريباً النص، والباقي يوتيوب/استكشاف/قنواتك — بالتناوب، ومع قيود التنوّع
    const plan = ['int', 'seq', 'int', 'exp', 'int', 'sub', 'seq', 'int', 'exp', 'int', 'seq', 'int', 'sub', 'exp'];
    const recent = (st && st.recentCh) || [];
    const used = new Map(), perQ = new Map(), out = [];
    const okCh = (v, loose) => {
      if (!loose && v._q && (perQ.get(v._q) || 0) >= 4) return false; // ولا موضوع بياخد أكتر من 4 بالدفعة
      const k = shCk({ name: v.author }); if (!k) return true; // ما عرفنا القناة: منعتبرها مختلفة
      const sc = shDecay(P.ch[k], now);
      if (sc <= -2) return false; // دايماً بتقلبها
      if ((used.get(k) || 0) >= (loose && sc >= 3 ? 2 : 1)) return false;
      return loose || !recent.includes(k);
    };
    const take = (src, loose) => {
      const l = pools[src]; if (!l) return false;
      const i = l.findIndex(v => okCh(v, loose)); if (i < 0) return false;
      const v = l.splice(i, 1)[0], k = shCk({ name: v.author });
      if (k) { used.set(k, (used.get(k) || 0) + 1); recent.push(k); if (recent.length > 8) recent.shift(); }
      if (v._q) perQ.set(v._q, (perQ.get(v._q) || 0) + 1);
      out.push(v); return true;
    };
    plan.forEach(src => take(src, false) || take('int', false) || take('exp', false));
    for (const src of ['int', 'exp', 'seq', 'sub']) while (out.length < 10 && take(src, true)) { /* لحد ما تكمل الدفعة */ }
    if (st) st.recentCh = recent;
    return out;
  };
}
// الإشارات: كيف كان هالشورت معك؟ (بتنحفظ على جهازك بس)
function shJudge(w) {
  if (!w || !w.v || w.done) return; w.done = true;
  const secs = (Date.now() - w.t0) / 1000, dur = w.dur || +w.v.duration || 0;
  const frac = w.loops ? 1 : dur ? w.max / dur : 0;
  let d = 0;
  if (w.nope) d = -4;
  else if (w.liked) d = 2.5;
  else if (w.loops || frac >= 0.8) d = 1;
  else if (frac >= 0.5) d = 0.3;
  else if (w.started && secs < 3 && frac < 0.3) d = -1; // قلبتو بسرعة
  const P = shProf.get();
  if (!P.seen.includes(w.v.id)) { P.seen.push(w.v.id); if (P.seen.length > 800) P.seen.splice(0, P.seen.length - 800); }
  if (!d) { shProf.save(P); return; }
  if (w.v._q) shBump(P.tp, w.v._q, d > 0 ? Math.min(d, 1) : d * 0.5, w.v._q);
  if (d > 0) {
    shTags(w.v.title).forEach(t => shBump(P.tp, t, 0.6, t));
    P.seed = [w.v.id, ...P.seed.filter(x => x !== w.v.id)].slice(0, 10);
  }
  shProf.save(P);
  shOwner(w.v).then(o => { if (!shCk(o)) return; const Q = shProf.get(); shBump(Q.ch, shCk(o), d, o.name, 500); shProf.save(Q); }).catch(() => {});
}
const homeShorts = () => cached('home-shorts', 30 * 60e3, async () => {
  const f = shortsFeed(); let all = [];
  for (let k = 0; k < 2 && all.length < 12; k++) all = all.concat(await f());
  return uniqById(all).slice(0, 16);
});
/* صورة الشورت بالطول: يوتيوب أحياناً ما عندو «oardefault» وبيرجّع صورة رمادية عليها «•••» (120×90)
   بدل ما يعطي خطأ — فمنفحص قياسها ومنجرّب اللي بعدها: صورة الجواب نفسو ← oardefault ← oar2 ← hqdefault (دايماً موجودة) */
function shortThumb(img, v) {
  const id = encodeURIComponent(v.id);
  const list = [];
  if (v.thumb && !/\/(mq|hq|sd)default\.jpg/.test(v.thumb)) list.push(v.thumb);
  list.push(`https://i.ytimg.com/vi/${id}/oardefault.jpg`, `https://i.ytimg.com/vi/${id}/oar2.jpg`, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
  let k = 0;
  const next = () => { if (++k < list.length) img.src = list[k]; };
  img.onerror = next;
  img.addEventListener('load', () => { if (img.naturalWidth === 120 && img.naturalHeight === 90 && k < list.length - 1) next(); }); // «ما في صورة» تبع يوتيوب
  img.src = list[0];
}
// بطاقة شورت بالطول (للرفوف)
function shortCard(v, list) {
  const a = el('a', 'short-card'); a.href = `#/shorts?v=${encodeURIComponent(v.id)}`; a.dataset.vid = v.id;
  const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
  shortThumb(img, v);
  const t = el('div', 'short-card-t', v.title || ''); t.dir = 'auto';
  const s = el('div', 'short-card-s', v.viewsText || '');
  a.append(img, t, s);
  a.addEventListener('click', () => { shortsCtx = { ch: '', items: list() }; preview.set(v.id, v); });
  return a;
}
// رف «شورتس» جوّا خلاصة الرئيسية
function homeShortsRow() {
  const wrap = el('div', 'shorts-row');
  wrap.append(sectionHead('شورتس', '#/shorts', 'shorts'));
  const row = el('div', 'short-strip');
  for (let i = 0; i < 6; i++) row.append(el('div', 'short-card sk'));
  wrap.append(row);
  homeShorts().then(list => {
    if (!list.length) { wrap.remove(); return; }
    row.replaceChildren(...list.map(v => shortCard(v, () => list)));
  }).catch(() => wrap.remove());
  return wrap;
}

/* لغة الصوت والترجمة بالشورتس — بينحفظو لكل الشورتس (shortsAud، cc، shortsCcLang) */
const shLangName = l => { try { return new Intl.DisplayNames(['ar'], { type: 'language' }).of(l) || l; } catch { return l; } };
function shortsAvRows(st) {
  const ym = st.video.ym, sp = st.sp;
  let langs = [];
  try { if (!ym && sp) langs = sp.getAudioLanguagesAndRoles(); } catch { /* */ }
  const audOpts = [['', 'الأصلي'], ['ar', 'العربي (إذا في دبلجة)']]
    .concat(langs.filter(l => l.role !== 'main' && l.language !== 'ar').map(l => [l.language, shLangName(l.language)]));
  const want = prefs.get('shortsAud') || '';
  if (want && !audOpts.some(o => o[0] === want)) audOpts.push([want, shLangName(want)]);
  const rows = [];
  if (ym) {
    // مشغّل يوتيوب المضمّن: ما بيسمح نغيّر الصوت من برّا (بيضل على اختيار يوتيوب)
    rows.push({ type: 'action', icon: 'globe', label: 'لغة الصوت (بمشغّل يوتيوب ما بتتغيّر)', fn: () => note('هالشورت شغّال بمشغّل يوتيوب المضمّن، وهو ما بيسمحلنا نختار الصوت. بتطبيق Nuvio عالأندرويد أو بالكمبيوتر مع إضافة Nuvio بيشتغل بمشغّلنا وبيمشي اختيارك.') });
  } else {
    rows.push({ type: 'choice', icon: 'globe', label: 'لغة الصوت (لكل الشورتس)' + (langs.length > 1 ? ` — هون ${langs.length} لغات` : ''), options: audOpts, get: () => prefs.get('shortsAud') || '', set: x => { prefs.set('shortsAud', x); if (st.applyAud) st.applyAud(true); } });
  }
  rows.push({ type: 'toggle', icon: 'book', label: 'الترجمة', get: () => !!prefs.get('cc'), set: x => { prefs.set('cc', x); if (st.applyCc) st.applyCc(); } });
  rows.push({ type: 'choice', icon: 'book', label: 'لغة الترجمة', options: [['ar', 'العربي (أو مترجمة تلقائياً)'], ['', 'لغة الفيديو']], get: () => prefs.get('shortsCcLang') || '', set: x => { prefs.set('shortsCcLang', x); if (st.applyCc) st.applyCc(); } });
  return rows;
}
function shortsMenu(v, sl) {
  const st = shortsState; if (!st) return;
  const video = st.video;
  openPrefSheet(v.title || 'شورتس', [
    { type: 'toggle', icon: 'play', label: 'تشغيل تلقائي (للشورت الجاي)', get: () => prefs.get('shortsAuto'), set: x => { prefs.set('shortsAuto', x); video.loop = !x; } },
    { type: 'choice', icon: 'spark', label: 'سرعة التشغيل', options: SPEEDS_S.map(r => [r, r === 1 ? 'عادي' : `${r}×`]), get: () => +prefs.get('shortsRate') || 1, set: x => { prefs.set('shortsRate', x); video.playbackRate = x; } },
    { type: 'toggle', icon: 'bolt', label: 'ضغطة مطوّلة = تسريع', get: () => prefs.get('holdSpeed'), set: x => prefs.set('holdSpeed', x) },
    { type: 'choice', icon: 'bolt', label: 'سرعة الضغط المطوّل', options: HOLD_RATES.map(r => [r, `${r}×`]), get: () => +prefs.get('holdRate') || 2, set: x => prefs.set('holdRate', x) },
    { type: 'toggle', icon: 'music', label: 'كتم الصوت', get: () => video.muted, set: x => { video.muted = x; if (!x) video.play().catch(() => {}); } },
    ...shortsAvRows(st),
    { type: 'choice', icon: 'wifi', label: 'توفير الإنترنت', options: [['auto', 'تلقائي'], ['on', 'دايماً (360p–480p)'], ['off', 'أبداً']], get: () => prefs.get('saver'), set: x => { prefs.set('saver', x); if (st.sp) try { st.sp.configure(saverCfg(video)); } catch { /* */ } } },
    { type: 'toggle', icon: 'eye', label: 'خبّي الأزرار (أو كبّر الفيديو بإصبعين)', get: () => !!prefs.get('shortsClean'), set: x => { if (st.setClean) st.setClean(x); if (!x && st.resetZoom) st.resetZoom(); } },
    { type: 'action', icon: 'list', label: 'ضيف لقائمة تشغيل', fn: () => addToPlaylist(v) },
    { type: 'action', icon: 'later', label: queue.has(v.id) ? 'شيل من «شغّل بعدين»' : 'شغّل بعدين', fn: () => note(queue.toggle(v) ? 'انضاف لـ«شغّل بعدين» ✓' : 'انشال من «شغّل بعدين»') },
    { type: 'action', icon: 'ban', label: 'مش مهتم', fn: () => { addNope('nope', v.id); if (st.watch && st.watch.v === v) st.watch.nope = true; note('تمام، ما رح نقترحلك ياه ولا كتير من هالقناة'); st.wrap.scrollBy({ top: st.wrap.clientHeight, behavior: 'smooth' }); } },
  ]);
}

async function renderShorts(startId, ch) {
  shortsExit();
  if (typeof miniOn !== 'undefined' && miniOn && active) { const n = active.np(); if (n) n.pauseAll(); }
  document.title = 'شورتس — Nuvio';
  document.body.classList.add('shorts-mode');
  const wrap = el('div', 'shorts');
  const back = el('button', 'shorts-back'); back.setAttribute('aria-label', 'رجوع');
  back.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>';
  back.onclick = () => { if (history.length > 1) history.back(); else location.hash = '#/'; };
  const mute = el('button', 'shorts-mute'); mute.setAttribute('aria-label', 'الصوت');
  // أسهم فوق/تحت (كمبيوتر)
  const nav = el('div', 'shorts-nav');
  const up = el('button', null); up.setAttribute('aria-label', 'اللي قبل'); up.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>';
  const dn = el('button', null); dn.setAttribute('aria-label', 'اللي بعدو'); dn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
  up.onclick = () => wrap.scrollBy({ top: -wrap.clientHeight, behavior: 'smooth' });
  dn.onclick = () => wrap.scrollBy({ top: wrap.clientHeight, behavior: 'smooth' });
  nav.append(up, dn);
  const vEl = document.createElement('video');
  vEl.playsInline = true; vEl.setAttribute('playsinline', ''); vEl.loop = true; vEl.preload = 'auto';
  vEl.className = 'short-video';
  const video = new ShortMedia(vEl); // <video> تبعنا، أو مشغّل يوتيوب لمّا سيرفرنا ما زبط — نفس الأزرار
  try { video.volume = JSON.parse(localStorage.getItem('nuvio:p:vol') || '1'); } catch { /* */ }
  const drawMute = () => { mute.innerHTML = video.muted ? '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z"/><path class="s" d="M16 9.5l5 5M21 9.5l-5 5"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z"/><path class="s" d="M15.5 8.8a4.5 4.5 0 0 1 0 6.4M18.2 6.2a8.2 8.2 0 0 1 0 11.6"/></svg>'; };
  mute.onclick = e => { e.stopPropagation(); video.muted = !video.muted; drawMute(); if (!video.muted) video.play().catch(() => {}); };
  video.addEventListener('volumechange', drawMute); drawMute();
  const s = shortsState = { wrap, video, sp: null, cur: null, seq: 0, seen: new Set(), more: null, busy: false, pre: new Map(), recentCh: [], watch: null };
  // الأزرار مخفية؟ (بيضل هيك حتى لمّا تقلب للشورت الجاي) — دائرة صغيرة تحت بترجّعها
  document.body.classList.toggle('shorts-clean', !!prefs.get('shortsClean'));
  const unclean = el('button', 'shorts-unclean'); unclean.setAttribute('aria-label', 'رجّع الأزرار'); unclean.title = 'رجّع الأزرار';
  unclean.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M6.2 17.8L17.8 6.2"/></svg>';
  const setClean = (on, quiet) => {
    prefs.set('shortsClean', on); document.body.classList.toggle('shorts-clean', on);
    if (!quiet) note(on ? 'الأزرار مخفية — كبّس الدائرة تحت لترجّعها' : 'رجعت الأزرار');
  };
  unclean.onclick = e => { e.stopPropagation(); resetZoom(); setClean(false); };
  /* زوم حقيقي بإصبعين: بيكبّر الفيديو (لحد 4×) وبيخبّي الأزرار. وهو مكبّر: إصبع واحد بيحرّكو، والتقليب واقف
     لحد ما ترجّعو لحجمو (بإصبعين) أو تكبس الدائرة. الزوم ما بيعمل إعجاب ولا إيقاف (s.multiAt) */
  const Z = { k: 1, x: 0, y: 0 };
  let pz = null, pan = null;
  s.multiAt = 0;
  const zEls = () => [vEl, video.ym && video.ym.el].filter(Boolean);
  const drawZoom = anim => {
    const W = wrap.clientWidth, H = wrap.clientHeight, mx = (Z.k - 1) * W / 2, my = (Z.k - 1) * H / 2;
    Z.x = Math.max(-mx, Math.min(mx, Z.x)); Z.y = Math.max(-my, Math.min(my, Z.y));
    zEls().forEach(n => { n.style.transition = anim ? 'transform .2s' : 'none'; n.style.transform = Z.k > 1.001 ? `translate(${Z.x}px, ${Z.y}px) scale(${Z.k})` : ''; });
    wrap.classList.toggle('zoomed', Z.k > 1.001);
  };
  const resetZoom = () => { Z.k = 1; Z.x = 0; Z.y = 0; drawZoom(true); };
  s.resetZoom = resetZoom;
  const two = e => { const [a, b] = e.touches; return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }; };
  wrap.addEventListener('touchstart', e => {
    if (e.touches.length >= 2) { s.multiAt = Date.now(); const t = two(e); pz = { d: t.d || 1, x: t.x, y: t.y, k: Z.k, zx: Z.x, zy: Z.y }; pan = null; }
    else if (Z.k > 1.001) pan = { x: e.touches[0].clientX, y: e.touches[0].clientY, zx: Z.x, zy: Z.y };
  }, { passive: true });
  wrap.addEventListener('touchmove', e => {
    if (e.touches.length >= 2 && pz) {
      if (e.cancelable) e.preventDefault(); // ما منخلّي الصفحة كلّها تكبر
      s.multiAt = Date.now();
      const t = two(e);
      Z.k = Math.max(1, Math.min(4, pz.k * t.d / pz.d));
      Z.x = pz.zx + (t.x - pz.x); Z.y = pz.zy + (t.y - pz.y);
      drawZoom(false);
      if (Z.k > 1.08 && !prefs.get('shortsClean')) setClean(true);
    } else if (pan && e.touches.length === 1 && Z.k > 1.001) {
      if (e.cancelable) e.preventDefault();
      Z.x = pan.zx + (e.touches[0].clientX - pan.x); Z.y = pan.zy + (e.touches[0].clientY - pan.y);
      drawZoom(false);
    }
  }, { passive: false });
  wrap.addEventListener('touchend', e => {
    if (pz) s.multiAt = Date.now();
    if (e.touches.length < 2) pz = null;
    if (!e.touches.length) { pan = null; if (Z.k < 1.08) resetZoom(); }
  }, { passive: true });
  s.setClean = setClean;
  const preloadShort = async v => {
    if (!s.sp || !s.sp.preload || s.pre.has(v.id) || shortsState !== s) return;
    try {
      const mf = await shortManifest(v.id);
      const pm = await s.sp.preload(toDataUri(mf.text, 'application/dash+xml'), 0, 'application/dash+xml');
      if (!pm) return;
      s.pre.set(v.id, pm);
      // ما منخلّي أكتر من 3 جاهزين (بياكلو ذاكرة)
      for (const [k, m] of s.pre) if (s.pre.size > 3 && k !== v.id) { s.pre.delete(k); try { m.destroy(); } catch { /* */ } }
    } catch { /* عادي */ }
  };
  const shade = el('div', 'shorts-top');
  const ttl = el('div', 'shorts-ttl'); ttl.innerHTML = (window.ico ? window.ico('shorts') : '') + '<span>شورتس</span>';
  shade.append(ttl);
  view.replaceChildren(wrap, shade, back, mute, nav, unclean);
  /* التشغيل بالخلفية عالتلفون: المتصفح بيوقّف الفيديو لمّا تطلع منو. متل المشغّل الكبير، منحوّل لملف الصوت لحالو
     (من جهازك: الإضافة/التطبيق، أو سكربت الآيفون)، ولمّا ترجع منكمّل الفيديو من وين وصل الصوت.
     بلا رابط صوت: منحاول نكمّل الفيديو نفسو (كروم عالأندرويد أحياناً بيسمح). */
  const bgA = new Audio(); bgA.preload = 'none'; bgA.setAttribute('playsinline', '');
  let bgUnlocked = false;
  const bgUnlock = () => { // لازم يشتغل مرة جوّا كبسة منك، لحتى الآيفون يسمحلو بعدين
    if (bgUnlocked || DESK_PTR) return; bgUnlocked = true;
    try { bgA.muted = true; const p = bgA.play(); if (p && p.catch) p.catch(() => {}); bgA.pause(); } catch { /* */ }
    setTimeout(() => { try { if (!s.bgOn) bgA.pause(); bgA.muted = false; } catch { /* */ } }, 0);
  };
  wrap.addEventListener('pointerup', bgUnlock, true);
  const shBgPrep = (v, my) => {
    if (DESK_PTR) return;
    const set = u => { if (u && my === s.seq) s.bgUrl = u; };
    if (typeof extUsable === 'function' && extUsable()) extManifest(v.id).then(m => set(extAudio(m.data))).catch(() => {});
    else if (typeof gmUsable === 'function' && gmUsable()) cached('gmbg:' + v.id, 30 * 60e3, () => extPlayer(v.id).then(j => extAudio(extParse(v.id, j)))).then(set).catch(() => {});
  };
  const toBg = () => {
    if (s.bgOn || shortsState !== s || s.userPaused || video.ym || DESK_PTR) return;
    if (!s.bgUrl) { vEl.play().catch(() => {}); return; }
    if (bgA.src !== s.bgUrl) bgA.src = s.bgUrl;
    const t = vEl.currentTime || 0;
    const go = () => { try { bgA.currentTime = t; } catch { /* */ } };
    if (bgA.readyState > 0) go(); else bgA.addEventListener('loadedmetadata', go, { once: true });
    bgA.loop = vEl.loop; bgA.playbackRate = vEl.playbackRate || 1; bgA.volume = vEl.muted ? 0 : vEl.volume;
    bgA.play().then(() => { s.bgOn = true; if (!vEl.paused) vEl.pause(); }).catch(() => { vEl.play().catch(() => {}); });
  };
  const fromBg = () => {
    if (!s.bgOn) return; s.bgOn = false;
    const t = bgA.currentTime || 0; bgA.pause();
    try { vEl.currentTime = t; } catch { /* */ }
    if (!s.userPaused) vEl.play().catch(() => {});
  };
  const onVis = () => { if (shortsState !== s) { document.removeEventListener('visibilitychange', onVis); bgA.pause(); bgA.removeAttribute('src'); return; } if (document.hidden) { if (!vEl.paused) toBg(); } else fromBg(); };
  document.addEventListener('visibilitychange', onVis);
  s.stopBg = () => { s.bgOn = false; document.removeEventListener('visibilitychange', onVis); try { bgA.pause(); bgA.removeAttribute('src'); bgA.load(); } catch { /* */ } };
  vEl.addEventListener('pause', () => { if (document.hidden && !s.userPaused && !s.bgOn) toBg(); }); // الآيفون بيوقّفو قبل ما يوصل الحدث

  const sideBtn = (icon, label, on, fn) => {
    const b = el('button', 'short-btn' + (on ? ' on' : ''));
    const i = el('span', 'short-ico'); i.innerHTML = window.ico ? window.ico(icon) : '';
    b.append(i, el('span', null, label));
    b.onclick = e => { e.stopPropagation(); const r = fn(); if (typeof r === 'boolean') b.classList.toggle('on', r); };
    return b;
  };
  const like = (sl, v) => {
    if (s.watch && s.watch.v === v) s.watch.liked = true;
    if (!lib.has('likes', v.id)) lib.add('likes', v);
    const b = sl.querySelector('.short-btn'); if (b) b.classList.add('on');
    const h = el('div', 'short-heart'); h.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.8 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';
    sl.append(h); setTimeout(() => h.remove(), 900);
  };
  const addSlide = v => {
    if (!v || !v.id || s.seen.has(v.id)) return;
    s.seen.add(v.id);
    preview.set(v.id, v);
    const sl = el('section', 'short loading'); sl._v = v;
    const poster = el('img', 'short-poster'); poster.alt = '';
    shortThumb(poster, v); // (بلا الصورة الرمادية «•••»)
    const spin = el('div', 'short-spin');
    const info = el('div', 'short-info');
    if (v.author) { const a = el(v.authorId ? 'a' : 'span', 'short-ch', '@' + v.author.replace(/^@/, '')); if (v.authorId) a.href = chHref(v.authorId); a.dir = 'auto'; info.append(a); }
    const t = el('div', 'short-title', v.title || ''); t.dir = 'auto'; info.append(t);
    const side = el('div', 'short-side');
    side.append(
      sideBtn('like', 'إعجاب', lib.has('likes', v.id), () => { const on = lib.toggle('likes', v); if (s.watch && s.watch.v === v) s.watch.liked = on; return on; }),
      sideBtn('saved', 'حفظ', lib.has('favs', v.id), () => lib.toggle('favs', v)),
      sideBtn('later', 'بعدين', queue.has(v.id), () => queue.toggle(v)),
      sideBtn('share', 'مشاركة', false, () => shareVideo(v)),
    );
    const moreB = el('button', 'short-btn short-more'); moreB.setAttribute('aria-label', 'إعدادات');
    const mi = el('span', 'short-ico'); mi.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="5.5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="18.5" r="1.9"/></svg>';
    moreB.append(mi);
    moreB.onclick = e => { e.stopPropagation(); shortsMenu(v, sl); };
    side.append(moreB);
    // شريط تقدّم بتقدر تسحبو
    const bar = el('div', 'short-bar'); bar.dir = 'ltr'; const fill = el('i'); bar.append(fill);
    const seek = e => { const r = bar.getBoundingClientRect(); const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); if (s.cur === sl && video.duration) video.currentTime = f * video.duration; };
    bar.addEventListener('pointerdown', e => { e.stopPropagation(); bar.setPointerCapture(e.pointerId); bar.classList.add('drag'); seek(e); });
    bar.addEventListener('pointermove', e => { if (bar.classList.contains('drag')) seek(e); });
    bar.addEventListener('pointerup', e => { e.stopPropagation(); bar.classList.remove('drag'); });
    const pp = el('div', 'short-pp');
    const fast = el('div', 'short-fast', `${prefs.get('holdRate')}× ⏩`);
    const fail = el('div', 'short-fail');
    const retry = el('button', null, 'جرّب مرة تانية'); retry.onclick = e => { e.stopPropagation(); sl.classList.remove('fail'); load(v, sl); };
    fail.append(el('div', null, 'ما قدرت شغّل هالفيديو هلّق'), retry);
    sl.append(poster, spin, info, side, bar, pp, fast, fail);
    // كبسة = إيقاف/تشغيل، كبستين = إعجاب، ضغطة مطوّلة = 2×
    let tapT = 0, lastTap = 0, holdT = 0, held = false;
    const multi = () => Date.now() - s.multiAt < 600; // زوم بإصبعين (أو لسّا رافع الأصابع منّو)
    sl.addEventListener('pointerdown', e => {
      if (e.target.closest('a, button, .short-bar') || s.cur !== sl) return;
      clearTimeout(holdT);
      if (!prefs.get('holdSpeed')) return;
      holdT = setTimeout(() => {
        if (multi() || Z.k > 1.001) return; // عم تكبّر أو تحرّك الصورة: مش تسريع
        held = true; const r = +prefs.get('holdRate') || 2;
        fast.textContent = `${r}× ⏩`; video.playbackRate = r;
        sl.classList.add('fast'); if (video.paused) video.play().catch(() => {});
      }, 450);
    });
    const endHold = () => { clearTimeout(holdT); if (held) { held = false; video.playbackRate = +prefs.get('shortsRate') || 1; sl.classList.remove('fast'); return true; } return false; };
    sl.addEventListener('pointercancel', endHold);
    sl.addEventListener('pointerleave', endHold);
    sl.addEventListener('pointerup', e => {
      if (endHold()) return;
      if (e.target.closest('a, button, .short-bar') || s.cur !== sl) return;
      if (multi() || !e.isPrimary) { clearTimeout(tapT); lastTap = 0; return; } // زوم: لا إعجاب ولا إيقاف
      if (pan && (Math.abs(Z.x - pan.zx) > 6 || Math.abs(Z.y - pan.zy) > 6)) { lastTap = 0; return; } // كان عم يحرّك الصورة المكبّرة
      const now = Date.now();
      if (now - lastTap < 300) { clearTimeout(tapT); lastTap = 0; like(sl, v); return; }
      lastTap = now;
      clearTimeout(tapT);
      tapT = setTimeout(() => {
        if (multi()) return;
        if (video.muted) { video.muted = false; video.play().catch(() => {}); return; }
        if (video.paused) { s.userPaused = false; video.play().catch(() => {}); } else { s.userPaused = true; video.pause(); }
      }, 260);
    });
    sl.addEventListener('contextmenu', e => e.preventDefault());
    wrap.append(sl);
    s.io.observe(sl);
  };
  // سيرفرنا ما زبط لهالشورت: من يوتيوب على جهازك، بنفس الواجهة. منكشفو بس لمّا نتأكد إنو الشورت نفسو (مش إعلان)
  const shortYt = (v, sl, my) => {
    const ym = new YtMedia(v.id);
    ym.el.classList.add('short-yt');
    try { vEl.pause(); } catch { /* */ }
    if (s.sp) s.sp.unload().catch(() => {});
    sl.classList.add('yt');
    sl.insertBefore(ym.el, vEl.nextSibling);
    video.useYt(ym);
    ym.load(0);
    let tries = 1, adAt = 0;
    const stopIv = () => { clearInterval(ym._iv); ym._iv = 0; };
    ym._iv = setInterval(() => {
      if (my !== s.seq || shortsState !== s || !ym.el.isConnected) { stopIv(); return; }
      if (ym.revealed) { stopIv(); return; }
      const now = Date.now();
      if (document.hidden) { ym.loadAt = now; return; }
      const dur = +v.duration || ym.dur;
      const ad = !!((ym.vid && ym.vid !== v.id) || (dur && ym.curDur && Math.abs(ym.curDur - dur) > 3));
      if (!ad && ym.ct0 >= 0 && ym.st === 1 && ym.ct - Math.max(ym.ct0, 0) > 0.4) { ym.reveal(); lib.add('hist', v); return; }
      if (!ym.wantPlay || now - ym.loadAt < 3500) return;
      const started = ym.st === 1 || ym.st === 3 || ym.ct > 0.3;
      if (!started) { ym.wantPlay = false; sl.classList.remove('loading'); sl.classList.add('paused'); return; } // بدّو كبسة منك
      if (ad) {
        if (tries < 2) { tries++; ym.load(0); return; }
        if (!adAt) { adAt = now; ym.cmd('mute'); }
        if (now - adAt > 120e3) ym.reveal();
        return;
      }
      if (now - Math.max(ym.loadAt, ym.ctMoveAt || 0) > 10000) { if (tries < 3) { tries++; ym.load(0); } else ym.reveal(); }
    }, 400);
  };
  const load = async (v, sl) => {
    const my = ++s.seq;
    video.pause();
    video.dropYt();
    wrap.querySelectorAll('.short.yt').forEach(x => x.classList.remove('yt'));
    sl.classList.add('loading'); sl.classList.remove('ready', 'fail', 'paused');
    try {
      if (!s.sp) {
        s.sp = new shaka.Player();
        await s.sp.attach(vEl);
        s.sp.getNetworkingEngine().registerRequestFilter(async (type, req) => { req.uris = await Promise.all(req.uris.map(fixUrl)); });
        s.sp.configure({
          preferredVideoCodecs: window.nuvioCodecs ? nuvioCodecs() : ['avc1', 'vp9'],
          streaming: { bufferingGoal: 12, rebufferingGoal: 0.6, segmentPrefetchLimit: 2, retryParameters: { maxAttempts: 6, baseDelay: 300, backoffFactor: 1.5, timeout: 15000, stallTimeout: 6000, connectionTimeout: 8000 } },
          manifest: { dash: { ignoreMinBufferTime: true } },
          abr: { enabled: true, defaultBandwidthEstimate: 1.5e6, switchInterval: 2 },
        });
      }
      s.sp.configure(saverCfg(vEl));
      s.sp.configure({ preferredAudioLanguage: prefs.get('shortsAud') || '' }); // فاضي = الأصلي (اللي يوتيوب معلّمو «original»)
      let ok = false;
      const pm = s.pre.get(v.id);
      if (pm) {
        s.pre.delete(v.id);
        try { await s.sp.load(pm); ok = true; } catch { /* منحمّل عادي */ }
        if (my !== s.seq) return;
      }
      if (!ok) try {
        const mf = await shortManifest(v.id);
        if (my !== s.seq) return;
        await s.sp.load(toDataUri(mf.text, 'application/dash+xml'), 0, 'application/dash+xml');
        ok = true;
      } catch { /* يوتيوب، أو mp4 */ }
      if (!ok && window.YtMedia) { if (my === s.seq) shortYt(v, sl, my); return; }
      if (!ok) {
        const { res } = await getVideo(v.id);
        if (my !== s.seq) return;
        const mp4 = res.sources.find(x => x.kind === 'mp4');
        if (!mp4) throw new Error('ما في مصدر');
        await s.sp.load(await fixUrl(mp4.url), 0, 'video/mp4');
      }
      if (my !== s.seq) return;
      s.applyAud(); s.applyCc(); // لغة الصوت والترجمة اللي اخترتها
      video.loop = !prefs.get('shortsAuto');
      video.playbackRate = +prefs.get('shortsRate') || 1;
      s.userPaused = false;
      try { await video.play(); } catch (e) {
        // بس إذا المتصفح فعلاً منع الصوت (NotAllowedError): بلا صوت، وكبسة وحدة بترجّعو.
        // (لمّا تقلب بسرعة، التشغيل القديم بينقطع بـ AbortError — هاد مش منع، وكان يكتم الصوت لحالو)
        if (e && e.name === 'NotAllowedError' && my === s.seq) { video.muted = true; video.play().catch(() => {}); }
      }
      lib.add('hist', v);
      shBgPrep(v, my); // رابط الصوت لحالو (للتشغيل بالخلفية عالتلفون)
    } catch {
      if (my === s.seq) { sl.classList.remove('loading'); sl.classList.add('fail'); }
    }
  };
  // لغة الصوت: اختيارك إذا موجود بهالشورت، وإلا الأصلي
  s.applyAud = fresh => {
    const sp = s.sp; if (!sp || video.ym) return;
    try {
      if (fresh) { sp.configure({ preferredAudioLanguage: prefs.get('shortsAud') || '' }); for (const m of s.pre.values()) try { m.destroy(); } catch { /* */ } s.pre.clear(); }
      const langs = sp.getAudioLanguagesAndRoles(); if (langs.length < 2) return;
      const want = prefs.get('shortsAud') || '';
      const t = (want && langs.find(l => l.language === want)) || langs.find(l => l.role === 'main') || langs[0];
      const act = sp.getVariantTracks().find(x => x.active) || {};
      if (act.language !== t.language || (t.role && !(act.audioRoles || []).includes(t.role))) sp.selectAudioLanguage(t.language, t.role || undefined);
    } catch { /* */ }
  };
  // الترجمة: من نفس جواب يوتيوب (من جهازك). العربي إذا موجود، وإلا ترجمة يوتيوب التلقائية للعربي (tlang)
  s.applyCc = async () => {
    const sp = s.sp, my = s.seq, v = s.cur && s.cur._v;
    if (video.ym) { try { video.ym.applyCc(); } catch { /* */ } return; } // مشغّل يوتيوب المضمّن بيعرف الترجمة لحالو
    if (!sp || !v) return;
    try { await sp.setTextTrackVisibility(false); } catch { /* */ }
    if (!prefs.get('cc') || typeof extUsable !== 'function' || !extUsable()) return;
    let caps = [];
    try { caps = (await extManifest(v.id)).data.captions || []; } catch { return; }
    if (my !== s.seq || !caps.length) return;
    const want = prefs.get('shortsCcLang') || '', base = l => String(l || '').split('-')[0];
    const own = want && (caps.find(c => base(c.lang) === want && !c.auto) || caps.find(c => base(c.lang) === want));
    const src = own || caps.find(c => !c.auto) || caps[0];
    const url = own || !want ? src.url : `${src.url}&tlang=${encodeURIComponent(want)}`;
    try {
      const tr = await sp.addTextTrackAsync(url, own || !want ? src.lang : want, 'subtitles', 'text/vtt', undefined, own || !want ? src.label : 'العربي (تلقائي)');
      if (my !== s.seq) return;
      sp.selectTextTrack(tr); await sp.setTextTrackVisibility(true);
      drawCc();
    } catch { /* يوتيوب ما عطى ترجمة هلّق */ }
  };
  // الترجمة بصندوق منّا فوق العنوان والأزرار (ترجمة المتصفح نفسو كانت تنقصّ عالجنب وتنخبى ورا الشريط السفلي)
  const ccBox = el('div', 'short-cc'); const ccTxt = el('span'); ccBox.append(ccTxt); ccBox.dir = 'auto'; ccBox.hidden = true;
  const drawCc = () => {
    let txt = '';
    try {
      if (prefs.get('cc') && !video.ym) {
        const t = [...vEl.textTracks].find(x => x.mode === 'showing');
        const cs = t && t.activeCues ? [...t.activeCues] : [];
        const c = cs.sort((a, b) => b.startTime - a.startTime)[0]; // ترجمة يوتيوب التلقائية بتتراكب: آخر وحدة بس
        if (c) txt = (c.getCueAsHTML ? c.getCueAsHTML().textContent : c.text.replace(/<[^>]+>/g, '')).trim();
      }
    } catch { /* */ }
    ccTxt.textContent = txt; ccBox.hidden = !txt;
  };
  vEl.textTracks.addEventListener('addtrack', e => { if (e.track) e.track.addEventListener('cuechange', drawCc); });
  vEl.textTracks.addEventListener('change', drawCc);
  const activate = sl => {
    if (s.cur === sl) return;
    if (s.cur) s.cur.classList.remove('active', 'ready', 'paused', 'fast');
    ccTxt.textContent = ''; ccBox.hidden = true; sl.append(ccBox);
    if (Z.k > 1.001) resetZoom(); // الشورت الجاي بيبلّش بحجمو الطبيعي
    s.bgUrl = '';
    shJudge(s.watch); // كيف كان الشورت اللي قبلو؟ (للاقتراحات)
    s.watch = { v: sl._v, t0: Date.now(), max: 0, last: 0, loops: 0, dur: 0, started: false };
    s.cur = sl; sl.classList.add('active');
    sl.insertBefore(vEl, sl.children[1] || null);
    video.playbackRate = 1;
    load(sl._v, sl);
    // جهّز اللي بعدو: ملفو + أول قطع منو، فبيبلّش فوراً لمّا تسحب
    const nx = sl.nextElementSibling;
    if (nx && nx._v) setTimeout(() => preloadShort(nx._v), 300);
    const nx2 = nx && nx.nextElementSibling;
    if (nx2 && nx2._v) setTimeout(() => preloadShort(nx2._v), 1800); // كمان اللي بعدو (للسحب السريع)
    const kids = [...wrap.children];
    if (kids.length - kids.indexOf(sl) < 4) loadMore();
  };
  s.io = new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting && e.intersectionRatio >= 0.6) activate(e.target);
  }, { root: wrap, threshold: [0.6] });
  video.addEventListener('timeupdate', () => {
    const b = s.cur && s.cur.querySelector('.short-bar i');
    if (b && video.duration) b.style.width = `${(video.currentTime / video.duration) * 100}%`;
    const w = s.watch; // قدّيش حضرت منو (ورجع من الأول؟)
    if (w && s.cur && w.v === s.cur._v) {
      const ct = video.currentTime || 0, d = video.duration || 0;
      if (ct > 0.2) w.started = true;
      if (d && isFinite(d)) w.dur = d;
      if (w.dur && w.last > w.dur - 1.5 && ct < 1.5) w.loops++;
      w.max = Math.max(w.max, ct); w.last = ct;
    }
  });
  // الصورة بتضل لحد ما يبلّش الفيديو فعلاً (بدل شاشة سودا)
  video.addEventListener('ended', () => {
    if (s.watch && s.cur && s.watch.v === s.cur._v) s.watch.loops++;
    if (!prefs.get('shortsAuto') || !s.cur) return;
    wrap.scrollBy({ top: wrap.clientHeight, behavior: 'smooth' });
  });
  video.addEventListener('playing', () => { if (s.cur) { s.cur.classList.add('ready'); s.cur.classList.remove('loading', 'paused'); } });
  video.addEventListener('waiting', () => { if (s.cur) s.cur.classList.add('loading'); });
  video.addEventListener('pause', () => { if (s.cur && !video.ended && s.cur.classList.contains('ready')) s.cur.classList.add('paused'); });
  video.addEventListener('play', () => { if (s.cur) s.cur.classList.remove('paused'); });
  const loadMore = async () => {
    if (s.busy || !s.more) return;
    s.busy = true;
    try { (await s.more()).forEach(addSlide); } catch { /* */ } finally { s.busy = false; }
  };
  wrap.tabIndex = 0;
  wrap.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); (e.key === 'ArrowDown' ? dn : up).click(); }
    if (e.key === ' ') { e.preventDefault(); if (video.paused) video.play().catch(() => {}); else video.pause(); }
    if (e.key.toLowerCase() === 'm') mute.click();
  });

  // القائمة: من القناة، أو من الرف اللي كبست منو، أو خلاصة شورتس
  let first = [];
  try {
    const ctx = shortsCtx && shortsCtx.items && shortsCtx.items.some(v => v.id === startId) && (!ch || shortsCtx.ch === ch) ? shortsCtx : null;
    if (ch) {
      let next = null, fetched = false;
      if (ctx) first = ctx.items;
      else { const r = await channelTab(ch, 'shorts'); first = r.items; next = r.next; fetched = true; }
      let feed = null; // لمّا تخلص شورتس القناة: منكمّل بالخلاصة المتنوّعة (متل يوتيوب)
      s.more = async () => {
        if (!fetched) { fetched = true; const r = await channelTab(ch, 'shorts'); next = r.next; return r.items; }
        if (!next) { feed = feed || shortsFeed(s); return feed(); }
        const r = await channelTab(ch, 'shorts', '', next); next = r.next; return r.items;
      };
    } else {
      s.seedId = startId || '';
      s.more = shortsFeed(s);
      first = ctx ? ctx.items : await s.more();
    }
  } catch { /* */ }
  if (shortsState !== s) return;
  if (startId) {
    const i = first.findIndex(v => v.id === startId);
    if (i > 0) first = first.slice(i);
    else if (i < 0) first = [{ ...(preview.get(startId) || {}), id: startId }].concat(first);
  }
  if (!first.length) { wrap.append(el('div', 'empty', 'ما لقيت شورتس هلّق. جرّب بعد شوي.')); return; }
  first.forEach(addSlide);
  wrap.focus({ preventScroll: true });
}

/* ================= الشريط السفلي العايم (للتلفون) ================= */
const BNAV = [
  ['/', 'home', 'الرئيسية'],
  ['/shorts', 'shorts', 'شورتس'],
  ['/music', 'music', 'موسيقى'],
  ['/subs', 'subs', 'القنوات'],
  ['/me', 'me', 'أنا'],
];
function buildBottomNav() {
  if (document.querySelector('.bnav')) return;
  const nav = el('nav', 'bnav'); nav.setAttribute('aria-label', 'التنقّل');
  for (const [path, icon, label] of BNAV) {
    const a = el('a', 'bnav-i'); a.href = '#' + path; a.dataset.path = path;
    const ic = el('span', 'bnav-ico');
    if (icon === 'me') ic.innerHTML = '<span class="bnav-me">N</span>';
    else ic.innerHTML = window.ico ? window.ico(icon) : '';
    a.append(ic, el('span', 'bnav-l', label));
    nav.append(a);
  }
  document.body.append(nav);
  document.body.classList.add('has-bnav');
  updateBottomNav();
}
window.addEventListener('nuvio:store', e => { if (['chTop', 'chSeen', 'subs', 'me'].includes(e.detail)) updateBottomNav(); });
function updateBottomNav() {
  const nav = document.querySelector('.bnav'); if (!nav) return;
  const path = (location.hash.slice(1) || '/').split('?')[0];
  const sec = path.startsWith('/music') ? '/music' : ['/history', '/likes', '/favs', '/later', '/searches', '/lists', '/list', '/lib', '/plist', '/settings', '/login', '/admin'].includes(path) ? '/me' : path;
  nav.querySelectorAll('.bnav-i').forEach(a => a.classList.toggle('on', a.dataset.path === sec));
  const meIc = nav.querySelector('.bnav-me');
  if (meIc) { const u = accUser(); meIc.textContent = u ? (u.name || u.email).trim().charAt(0).toUpperCase() : 'N'; }
  const subsBtn = nav.querySelector('[data-path="/subs"]');
  if (subsBtn) subsBtn.classList.toggle('dot', subs.list().some(c => chNew.has(c.id)));
  if (path !== '/watch') { clearTimeout(bnavKickT); bnavKickT = setTimeout(bnavKick, 380); }
}
/* سفاري الآيفون أحياناً ما بيرجع يرسم الشريط التحتاني بعد ما ترجع من الفيديو
   أو من ملء الشاشة أو تدوير التلفون: منتأكد إنو موجود، ومنجبرو ينرسم من جديد */
let bnavKickT = 0;
function bnavKick() {
  if (document.documentElement.classList.contains('tv')) return;
  const path = (location.hash.slice(1) || '/').split('?')[0];
  if (path !== '/watch' && document.body.classList.contains('watching')) document.body.classList.remove('watching');
  let nav = document.querySelector('.bnav');
  if (!nav) { buildBottomNav(); nav = document.querySelector('.bnav'); }
  if (nav && nav.parentNode !== document.body) document.body.append(nav);
  if (!nav || (nav.getAnimations && nav.getAnimations().length)) return;
  nav.style.display = 'none'; void nav.offsetHeight; nav.style.display = ''; // (بنفس اللحظة: ما بيرمش)
}
{
  const kickSoon = () => { clearTimeout(bnavKickT); bnavKickT = setTimeout(bnavKick, 400); };
  addEventListener('pageshow', kickSoon);
  addEventListener('orientationchange', kickSoon);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kickSoon(); });
  document.addEventListener('webkitendfullscreen', kickSoon, true); // آيفون: طلعت من ملء الشاشة تبع النظام
  document.addEventListener('fullscreenchange', kickSoon);
  document.addEventListener('webkitfullscreenchange', kickSoon);
}

/* ================= صفحة «أنا»: السجل ومكتبتك =================
   هلّق كل شي على جهازك؛ لاحقاً منضيف تسجيل دخول لحتى تنحفظ بياناتك وتلاقيها على أي جهاز. */
function libRow(href, title, sub, thumbId, icon) {
  const a = el('a', 'lib-row'); a.href = href;
  const st = el('div', 'lib-stack');
  if (thumbId) { const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.src = ytThumb(thumbId); st.append(img); }
  else st.classList.add('empty-stack');
  if (icon) { const b = el('span', 'lib-badge'); b.innerHTML = window.ico ? window.ico(icon) : ''; st.append(b); }
  const tx = el('div', 'lib-tx');
  const t = el('div', 'lib-t', title); t.dir = 'auto';
  tx.append(t, el('div', 'lib-s', sub));
  a.append(st, tx);
  return a;
}
/* ================= مكتبتك: شورتس / فيديوهات / أغاني ================= */
const isShortItem = v => !!(v && v.short);
const isMusicItem = v => !!(v && v.music);
const LIB_TYPES = {
  shorts: { title: 'شورتس', icon: 'shorts', tabs: [['likes', 'المعجب فيهم', 'like'], ['hist', 'السجل', 'clock'], ['favs', 'المحفوظ', 'saved']],
    pick: k => lib.list(k).filter(isShortItem) },
  videos: { title: 'فيديوهات', icon: 'play', tabs: [['likes', 'الإعجابات', 'like'], ['hist', 'السجل', 'clock'], ['favs', 'المحفوظة', 'saved']],
    pick: k => lib.list(k).filter(v => !isShortItem(v) && !isMusicItem(v)) },
  music: { title: 'أغاني', icon: 'music', tabs: [['likes', 'المعجب فيهم', 'like'], ['mhist', 'السجل السماعي', 'phones'], ['favs', 'المحفوظة', 'saved']],
    pick: k => (k === 'mhist' ? lib.list('mhist') : lib.list(k).filter(isMusicItem)) },
};
const meTab = { shorts: 'likes', videos: 'hist', music: 'mhist' };
const EMPTY_MSG = {
  shorts: { likes: 'لسّا ما عملت إعجاب لشورت. كبستين عالشورت = إعجاب ❤', hist: 'لسّا ما شفت شورتس.', favs: 'ما في شورتس محفوظة.' },
  videos: { likes: 'لسّا ما عملت إعجاب لفيديو.', hist: 'لسّا ما شفت شي.', favs: 'ما في فيديوهات محفوظة.' },
  music: { likes: 'لسّا ما عملت إعجاب لأغنية.', mhist: 'لسّا ما سمعت شي بـ Nuvio Music.', favs: 'ما في أغاني محفوظة.' },
};
function meLibSection(type) {
  const T = LIB_TYPES[type];
  const box = el('div', 'me-sec');
  const head = sectionHead(T.title, `#/lib?t=${type}&k=${meTab[type]}`, T.icon);
  const tabs = el('div', 'me-shorts-tabs');
  const body = el('div', 'me-sec-body');
  const draw = k => {
    meTab[type] = k;
    const more = head.querySelector('.sec-more'); if (more) more.href = `#/lib?t=${type}&k=${k}`;
    tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    const list = T.pick(k);
    body.replaceChildren();
    if (!list.length) {
      const e = el('div', 'me-shorts-empty');
      e.append(el('span', null, EMPTY_MSG[type][k] || 'فاضي'));
      if (type === 'shorts') { const go = el('a', 'btn btn-main', 'افتح الشورتس'); go.href = '#/shorts'; e.append(go); }
      body.append(e);
      return;
    }
    if (type === 'shorts') {
      const grid = el('div', 'short-grid');
      list.slice(0, 6).forEach(v => grid.append(shortCard(v, () => list)));
      body.append(grid);
    } else {
      const shelf = el('div', 'shelf');
      list.slice(0, 16).forEach(v => shelf.append(card(v)));
      body.append(shelf);
    }
    if (list.length > (type === 'shorts' ? 6 : 16)) {
      const all = el('a', 'btn me-more', `عرض الكل (${nf.format(list.length)})`); all.href = `#/lib?t=${type}&k=${k}`;
      body.append(all);
    }
  };
  for (const [k, label, icon] of T.tabs) {
    const n = T.pick(k).length;
    const b = el('button'); b.dataset.k = k;
    const ic = el('span', 'me-st-ico'); ic.innerHTML = window.ico ? window.ico(icon) : '';
    b.append(ic, el('span', null, label), el('small', null, n ? nf.format(n) : '—'));
    // كبسة = اختيار، وكبسة على المختار = بتفوت على القسم كامل
    b.onclick = () => { if (b.classList.contains('on')) location.hash = `#/lib?t=${type}&k=${k}`; else draw(k); };
    tabs.append(b);
  }
  box.append(head, tabs, body);
  draw(T.tabs.some(x => x[0] === meTab[type]) ? meTab[type] : T.tabs[0][0]);
  return box;
}
// صفحة قسم كامل: مثلاً «شورتس — المعجب فيهم»
function renderLibView(type, k) {
  const T = LIB_TYPES[type] || LIB_TYPES.videos;
  const tab = T.tabs.find(x => x[0] === k) || T.tabs[0];
  const list = T.pick(tab[0]);
  document.title = `${T.title} — ${tab[1]} — Nuvio`;
  const head = sectionHead(`${T.title} · ${tab[1]} (${nf.format(list.length)})`, null, T.icon);
  const chips = el('div', 'filter-bar');
  T.tabs.forEach(([kk, label]) => {
    const b = el('button', 'f-chip' + (kk === tab[0] ? ' on' : ''), label);
    b.onclick = () => { location.hash = `#/lib?t=${type}&k=${kk}`; };
    chips.append(b);
  });
  const types = el('div', 'filter-bar');
  Object.entries(LIB_TYPES).forEach(([tt, d]) => {
    const b = el('button', 'f-chip' + (tt === type ? ' on' : ''), d.title);
    b.onclick = () => { location.hash = `#/lib?t=${tt}&k=${(d.tabs.find(x => x[0] === tab[0]) || d.tabs[0])[0]}`; };
    types.append(b);
  });
  view.replaceChildren(head, types, chips);
  if (!list.length) { view.append(el('div', 'empty', EMPTY_MSG[type] && EMPTY_MSG[type][tab[0]] || 'فاضي')); return; }
  const g = el('div', type === 'shorts' ? 'short-grid' : 'grid');
  list.forEach(v => {
    const c = type === 'shorts' ? shortCard(v, () => list) : card(v);
    const x = el('button', 'card-x', '✕'); x.title = 'شيل';
    x.onclick = e => { e.preventDefault(); e.stopPropagation(); lib.remove(tab[0], v.id); c.remove(); };
    (c.querySelector('.thumb') || c).append(x);
    g.append(c);
  });
  view.append(g);
}

/* ================= قوائم التشغيل الخاصة فيك ================= */
const plists = {
  all: () => store.get('playlists', []),
  get: id => plists.all().find(p => p.id === id),
  create(title) {
    const p = { id: 'pl' + Date.now().toString(36), title: (title || '').trim() || 'قائمة جديدة', at: Date.now(), videos: [] };
    store.set('playlists', [p, ...plists.all()]);
    return p;
  },
  save(p) { store.set('playlists', plists.all().map(x => (x.id === p.id ? p : x))); },
  remove(id) { store.set('playlists', plists.all().filter(p => p.id !== id)); },
  has: (id, vid) => { const p = plists.get(id); return !!(p && p.videos.some(v => v.id === vid)); },
  toggle(id, v) {
    const p = plists.get(id); if (!p) return false;
    const i = p.videos.findIndex(x => x.id === v.id);
    if (i >= 0) p.videos.splice(i, 1); else p.videos.push(slim(v));
    plists.save(p);
    return i < 0;
  },
};
// خانة كتابة صغيرة من تحت (اسم القائمة)
function askText(title, placeholder, initial = '') {
  return new Promise(resolve => {
    const ov = el('div', 'np-sheet-ov sheet-ov');
    const sh = el('div', 'np-sheet ask-sheet'); sh.dir = 'rtl';
    const inp = el('input', 'ask-input'); inp.type = 'text'; inp.placeholder = placeholder || ''; inp.value = initial; inp.maxLength = 80;
    const ok = el('button', 'btn btn-main', 'حفظ');
    const no = el('button', 'btn', 'إلغاء');
    const row = el('div', 'ask-btns'); row.append(no, ok);
    sh.append(el('div', 'np-grip'), el('div', 'sheet-title', title), inp, row);
    ov.append(sh);
    const done = v => { ov.classList.remove('open'); if (window.nuvioLockScroll) window.nuvioLockScroll(false); setTimeout(() => ov.remove(), 260); resolve(v); };
    ok.onclick = () => done(inp.value.trim() || null);
    no.onclick = () => done(null);
    inp.onkeydown = e => { if (e.key === 'Enter') ok.click(); if (e.key === 'Escape') no.click(); };
    ov.onclick = e => { if (e.target === ov) done(null); };
    document.body.append(ov);
    if (window.nuvioLockScroll) window.nuvioLockScroll(true);
    requestAnimationFrame(() => { ov.classList.add('open'); setTimeout(() => inp.focus(), 200); });
  });
}
async function newPlaylist(firstVideo) {
  const name = await askText('قائمة تشغيل جديدة', 'اسم القائمة (مثلاً: أغاني الصبح)');
  if (!name) return null;
  const p = plists.create(name);
  if (firstVideo) plists.toggle(p.id, firstVideo);
  note(firstVideo ? `انضاف لـ«${p.title}» ✓` : `انعملت «${p.title}» ✓`);
  return p;
}
function addToPlaylist(v) {
  const rows = plists.all().map(p => ({
    type: 'toggle', icon: 'list', label: `${p.title} (${nf.format(p.videos.length)})`,
    get: () => plists.has(p.id, v.id),
    set: () => note(plists.toggle(p.id, v) ? `انضاف لـ«${p.title}» ✓` : `انشال من «${p.title}»`),
  }));
  rows.push({ type: 'action', icon: 'plus', label: 'قائمة جديدة…', fn: () => newPlaylist(v) });
  openPrefSheet('ضيف لقائمة تشغيل', rows);
}
// تشغيل قائمة: الفيديو الجاي من القائمة نفسها
// playCtx: { ids, items, title, author, plid (قائمة يوتيوب) أو uid (قائمتك)، total, loop, shuffle, played }
let playCtx = null;
function playList(videos, title, shuffleIt, uid) {
  const list = shuffleIt ? shuffle(videos) : videos.slice();
  if (!list.length) return;
  playCtx = { ids: list.map(v => v.id), items: list, title, uid: uid || '', total: list.length, loop: false, shuffle: false };
  list.forEach(v => preview.set(v.id, v));
  note(`عم نشغّل «${title}»`);
  goNext({ v: list[0], fromList: title });
}
// «&list=…» بالرابط (لحتى التحديث والمشاركة يرجّعو نفس القائمة)
const plParam = () => (playCtx && playCtx.mix ? `&list=mix:${encodeURIComponent(playCtx.mix)}` : playCtx && playCtx.plid ? `&list=${encodeURIComponent(playCtx.plid)}` : playCtx && playCtx.uid ? `&list=u:${encodeURIComponent(playCtx.uid)}` : '');

/* ===== تشكيلة (Mix) متل يوتيوب: بتبلّش من هالفيديو وبتكمّل من المشابه، بلا نهاية =====
   (تشكيلات يوتيوب نفسها ما بتنعطى بلا حساب، فمنبنيها نحنا من «المشابه» — بنفس الفكرة) */
const mixOk = v => v && v.id && !v.live && !v.short && (typeof wanted !== 'function' || wanted(v));
async function mixCtx(seed) {
  const first = { ...(preview.get(seed) || { id: seed }) };
  if (!first.title) first.title = document.title.replace(/ — Nuvio$/, '').trim(); // عنوان الفيديو اللي فاتح
  const rel = await relatedOf(seed);
  const items = [first, ...rel.filter(v => mixOk(v) && v.id !== seed)].slice(0, 25);
  if (items.length < 2) throw new Error('ما في مشابه');
  items.forEach(v => preview.set(v.id, v));
  playCtx = { ids: items.map(v => v.id), items, title: first.title ? `تشكيلة: ${first.title}` : 'تشكيلة', author: '', mix: seed, infinite: true, total: items.length, loop: false, shuffle: false, played: new Set() };
}
async function mixGrow(c) {
  if (c._growing) return;
  c._growing = true;
  try {
    const last = c.items[c.items.length - 1];
    const rel = await relatedOf(last.id);
    const have = new Set(c.ids);
    rel.filter(v => mixOk(v) && !have.has(v.id)).slice(0, 15).forEach(v => { preview.set(v.id, v); c.items.push(v); c.ids.push(v.id); });
    c.total = c.items.length;
  } catch { /* */ } finally { c._growing = false; }
}
const plWatchHref = id => `#/watch?v=${encodeURIComponent(id)}${plParam()}`;

/* ================= قوائم يوتيوب متل يوتيوب: لوحة جنب الفيديو، والجاي من القائمة ================= */
// شبّاك من القائمة حوالين الفيديو (يوتيوب بيرجّع لحد ~200 فيديو)؛ بلا فيديو = من أول القائمة
function ytPlaylistWin(plid, vid) {
  return cached(`plw:${plid}:${vid || ''}`, 10 * 60e3, async () => {
    const d = await yti('next', vid ? { videoId: vid, playlistId: plid } : { playlistId: plid });
    const pl = (((d.contents || {}).twoColumnWatchNextResults || {}).playlist || {}).playlist;
    if (!pl || !pl.contents) throw new Error('ما في قائمة');
    const items = pl.contents.map(c => c.playlistPanelVideoRenderer).filter(r => r && r.videoId && !r.unplayableText).map(r => {
      const by = ((r.shortBylineText || r.longBylineText || {}).runs || [])[0] || {};
      return {
        id: r.videoId, title: ytTxt(r.title), author: by.text || '', authorId: ((by.navigationEndpoint || {}).browseEndpoint || {}).browseId || '',
        duration: durSec(ytTxt(r.lengthText)), thumb: ytThumb(r.videoId), idx: ((r.navigationEndpoint || {}).watchEndpoint || {}).index,
      };
    });
    if (!items.length) throw new Error('القائمة فاضية');
    const cur = ((d.currentVideoEndpoint || {}).watchEndpoint || {}).videoId || vid || items[0].id;
    return { plid, title: ytTxt(pl.title) || ytTxt(pl.titleText), author: ytTxt(pl.ownerName) || ytTxt(pl.shortBylineText), total: +pl.totalVideos || items.length, items, cur, infinite: !!pl.isInfinite || /^RD/.test(plid) };
  });
}
function plCtxFrom(w, keep) {
  const prev = keep && playCtx && playCtx.plid === w.plid ? playCtx : null;
  // منضيف الشبّاك الجديد للي عنا (بلا تكرار)، مرتّب حسب رقم الفيديو بالقائمة
  const map = new Map((prev ? prev.items : []).map(v => [v.id, v]));
  w.items.forEach(v => map.set(v.id, v));
  const items = [...map.values()].sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0));
  items.forEach(v => preview.set(v.id, v));
  playCtx = { ids: items.map(v => v.id), items, title: w.title, author: w.author, plid: w.plid, total: w.total, infinite: w.infinite, loop: prev ? prev.loop : false, shuffle: prev ? prev.shuffle : false, played: prev ? prev.played : new Set() };
}
// #/watch?list=… (بلا فيديو): منبلّش من أول القائمة (أو عشوائي)
async function startPlaylist(plid, shuffled) {
  view.replaceChildren(el('div', 'loading', 'عم جهّز القائمة…'));
  try {
    const w = await ytPlaylistWin(plid);
    plCtxFrom(w, false);
    if (shuffled) playCtx.shuffle = true;
    const first = shuffled ? playCtx.items[Math.floor(Math.random() * playCtx.items.length)] : playCtx.items.find(v => v.id === w.cur) || playCtx.items[0];
    location.replace(`#/watch?v=${encodeURIComponent(first.id)}${plParam()}`);
  } catch { view.replaceChildren(el('div', 'empty', 'ما قدرت جيب القائمة.')); }
}
// صفحة الفيديو: إذا في قائمة، منجهّزها ومنحط اللوحة (عالكمبيوتر فوق المشابه، عالتلفون تحت المعلومات)
async function mountPlaylist(id, listParam, parts) {
  if (!listParam) { if (playCtx && !playCtx.ids.includes(id)) playCtx = null; }
  else if (listParam.startsWith('u:')) {
    const p = plists.get(listParam.slice(2));
    if (p && p.videos.length && (!playCtx || playCtx.uid !== p.id)) playCtx = { ids: p.videos.map(v => v.id), items: p.videos.slice(), title: p.title, uid: p.id, total: p.videos.length, loop: false, shuffle: false };
  } else if (listParam.startsWith('mix:')) {
    const seed = listParam.slice(4);
    if (!playCtx || playCtx.mix !== seed || !playCtx.ids.includes(id)) { try { await mixCtx(seed); } catch { return; } }
  } else if (!playCtx || playCtx.plid !== listParam || !playCtx.ids.includes(id)) {
    try { const w = await ytPlaylistWin(listParam, id); if (!parts.info.isConnected && active && active.id !== id) return; plCtxFrom(w, true); } catch { return; }
  }
  const c = playCtx;
  if (!c || !c.ids.includes(id)) { if (queue.list().some(v => v.id !== id) && (parts.info.isConnected || (active && active.id === id))) placePanel(queuePanel(id), parts); return; }
  if (!parts.info.isConnected && !(active && active.id === id)) return;
  // قربنا من آخر الشبّاك وبالقائمة أكتر؟ منجيب الشبّاك الجاي سلفاً
  const i = c.ids.indexOf(id), last = c.items[c.items.length - 1];
  if (c.plid && i >= c.ids.length - 3 && last && (c.infinite || (last.idx != null && last.idx + 1 < c.total))) ytPlaylistWin(c.plid, last.id).then(w => { if (playCtx === c) { plCtxFrom(w, true); } }).catch(() => {});
  if (c.mix && i >= c.ids.length - 4) mixGrow(c); // التشكيلة بتكمّل لحالها
  placePanel(playlistPanel(id), parts);
}
// اللوحة: عالكمبيوتر فوق المشابه، عالتلفون تحت المعلومات (مصغّرة)
function placePanel(panel, parts) {
  const wide = matchMedia('(min-width: 1051px)');
  const place = () => { if (!panel.isConnected && panel._placed) { wide.removeEventListener('change', place); return; } panel._placed = true; if (wide.matches) parts.side.prepend(panel); else parts.info.after(panel); panel.classList.toggle('folded', !wide.matches && !panel._open); };
  place();
  wide.addEventListener('change', place);
}
// Shift+P: الفيديو اللي قبل (بالقائمة، وإلا رجوع)
window.nuvioPrev = () => {
  const cur = typeof active !== 'undefined' && active ? active.id : '';
  if (playCtx && cur) { const i = playCtx.ids.indexOf(cur); if (i > 0) { goNext({ v: playCtx.items[i - 1], fromList: playCtx.title }); return; } }
  history.back();
};
/* ===== «شغّل بعدين» جنب الفيديو متل يوتيوب: الجاي بيشتغل لحالو، وبتقدر ترتّبها وتشيل منها ===== */
function queuePanel(curId) {
  const p = el('section', 'pl-panel q-panel'); p.dir = 'rtl';
  const head = el('div', 'plp-head');
  const tb = el('div', 'plp-tb');
  const tt = el('div', 'plp-title', 'شغّل بعدين');
  const sub = el('div', 'plp-sub');
  const nx = el('div', 'plp-next');
  tb.append(tt, sub, nx);
  const btns = el('div', 'plp-btns');
  const mkB = (svg, label) => { const b = el('button', 'plp-b'); b.innerHTML = svg; b.title = label; b.setAttribute('aria-label', label); return b; };
  const bClr = mkB('<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>', 'امسح الكل');
  const bFold = mkB('<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>', 'صغّر/كبّر');
  bClr.onclick = e => { e.stopPropagation(); if (confirm('تمسح كل «شغّل بعدين»؟')) store.set('later', []); };
  bFold.onclick = e => { e.stopPropagation(); p._open = p.classList.contains('folded'); p.classList.toggle('folded'); };
  head.onclick = e => { if (p.classList.contains('folded') && !e.target.closest('a, button')) { p._open = true; p.classList.remove('folded'); } };
  btns.append(bClr, bFold);
  head.append(tb, btns);
  const list = el('div', 'plp-list');
  const draw = () => {
    const items = queue.list().filter(v => v.id !== curId);
    if (!items.length) { p.remove(); return; }
    sub.textContent = `${items.length.toLocaleString('ar')} فيديو · الجاي بيشتغل لحالو`;
    nx.textContent = `الجاي: ${items[0].title || ''}`; nx.dir = 'auto';
    list.replaceChildren();
    items.forEach((v, k) => {
      const a = el('a', 'plp-row'); a.href = `#/watch?v=${encodeURIComponent(v.id)}`;
      a.onclick = e => { e.preventDefault(); goNext({ v, fromQueue: true }); };
      const n = el('span', 'plp-n', (k + 1).toLocaleString('ar'));
      const th = el('span', 'plp-th'); const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.src = v.thumb || ytThumb(v.id); th.append(img);
      if (v.duration) th.append(el('span', 'plp-dur', fmtT(v.duration)));
      const meta = el('span', 'plp-meta'); const t = el('span', 'plp-t', v.title || ''); t.dir = 'auto'; meta.append(t, el('span', 'plp-a', v.author || ''));
      const ops = el('span', 'q-ops');
      const mv = (d, sym, label) => {
        const b = el('button', 'q-op', sym); b.title = label; b.setAttribute('aria-label', label);
        b.onclick = e => { e.preventDefault(); e.stopPropagation(); const all = queue.list(); const i = all.findIndex(x => x.id === v.id), j = i + d; if (i < 0 || j < 0 || j >= all.length) return; [all[i], all[j]] = [all[j], all[i]]; store.set('later', all); };
        return b;
      };
      const rm = el('button', 'q-op', '✕'); rm.title = 'شيلو'; rm.setAttribute('aria-label', 'شيلو');
      rm.onclick = e => { e.preventDefault(); e.stopPropagation(); queue.remove(v.id); };
      ops.append(mv(-1, '▲', 'لفوق'), mv(1, '▼', 'لتحت'), rm);
      a.append(n, th, meta, ops); list.append(a);
    });
  };
  draw();
  const onStore = e => { if (!p.isConnected && p._placed) { window.removeEventListener('nuvio:store', onStore); return; } if (e.detail === 'later') draw(); };
  window.addEventListener('nuvio:store', onStore);
  p.append(head, list);
  return p;
}

function playlistPanel(curId) {
  const c = playCtx;
  const p = el('section', 'pl-panel'); p.dir = 'rtl';
  const i = c.ids.indexOf(curId);
  const pos = c.items[i] && c.items[i].idx != null ? c.items[i].idx + 1 : i + 1;
  const head = el('div', 'plp-head');
  const tb = el('div', 'plp-tb');
  const tt = el(c.plid || c.uid ? 'a' : 'div', 'plp-title', c.title || 'قائمة تشغيل'); tt.dir = 'auto';
  if (c.plid) tt.href = `#/pl?id=${encodeURIComponent(c.plid)}`; else if (c.uid) tt.href = `#/plist?id=${encodeURIComponent(c.uid)}`;
  const sub = el('div', 'plp-sub'); sub.dir = 'auto';
  sub.textContent = c.infinite ? 'تشكيلة · بتكمّل لحالها من المشابه' : `${pos.toLocaleString('ar')} / ${(c.total || c.ids.length).toLocaleString('ar')}${c.author ? ' · ' + c.author : ''}`;
  const nxt = c.items[i + 1] || (c.loop ? c.items[0] : null);
  const nx = el('div', 'plp-next', nxt ? `الجاي: ${nxt.title || ''}` : 'آخر فيديو بالقائمة'); nx.dir = 'auto';
  tb.append(tt, sub, nx);
  const btns = el('div', 'plp-btns');
  const mkB = (svg, label, on) => { const b = el('button', 'plp-b' + (on ? ' on' : '')); b.innerHTML = svg; b.title = label; b.setAttribute('aria-label', label); return b; };
  const bLoop = mkB('<svg viewBox="0 0 24 24"><path d="M17 2.5l3 3-3 3M4 11V9.5a4 4 0 0 1 4-4h12M7 21.5l-3-3 3-3M20 13v1.5a4 4 0 0 1-4 4H4"/></svg>', 'كرّر القائمة', c.loop);
  const bShuf = mkB('<svg viewBox="0 0 24 24"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>', 'عشوائي', c.shuffle);
  const bFold = mkB('<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>', 'صغّر/كبّر');
  const bX = mkB('<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>', 'سكّر القائمة');
  bLoop.onclick = e => { e.stopPropagation(); c.loop = !c.loop; bLoop.classList.toggle('on', c.loop); note(c.loop ? 'القائمة بتتكرّر ✓' : 'بلا تكرار'); };
  bShuf.onclick = e => { e.stopPropagation(); c.shuffle = !c.shuffle; c.played = new Set([curId]); bShuf.classList.toggle('on', c.shuffle); note(c.shuffle ? 'عشوائي ✓' : 'بالترتيب'); };
  bFold.onclick = e => { e.stopPropagation(); p._open = p.classList.contains('folded'); p.classList.toggle('folded'); };
  bX.onclick = e => {
    e.stopPropagation(); playCtx = null; p.remove();
    history.replaceState(null, '', location.href.replace(/&list=[^&#]*/, '')); // الرابط بلا القائمة (بلا ما ينعاد تحميل الفيديو)
  };
  head.onclick = e => { if (p.classList.contains('folded') && !e.target.closest('a, button')) { p._open = true; p.classList.remove('folded'); } };
  btns.append(bLoop, bShuf, bFold, bX);
  head.append(tb, btns);
  const list = el('div', 'plp-list');
  c.items.forEach((v, k) => {
    const a = el('a', 'plp-row' + (v.id === curId ? ' on' : '')); a.href = plWatchHref(v.id);
    a.onclick = () => preview.set(v.id, v);
    const n = el('span', 'plp-n', v.id === curId ? '▶' : ((v.idx != null ? v.idx : k) + 1).toLocaleString('ar'));
    const th = el('span', 'plp-th'); const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.src = v.thumb || ytThumb(v.id); th.append(img);
    if (v.duration) th.append(el('span', 'plp-dur', fmtT(v.duration)));
    const meta = el('span', 'plp-meta');
    const t = el('span', 'plp-t', v.title || ''); t.dir = 'auto';
    meta.append(t, el('span', 'plp-a', v.author || ''));
    a.append(n, th, meta); list.append(a);
  });
  p.append(head, list);
  // الفيديو الحالي بنص اللوحة
  requestAnimationFrame(() => requestAnimationFrame(() => { const on = list.querySelector('.on'); if (on) list.scrollTop = Math.max(0, on.offsetTop - list.offsetTop - 8); }));
  return p;
}
function renderUserPlaylist(id) {
  const p = plists.get(id);
  if (!p) { view.replaceChildren(el('div', 'empty', 'هالقائمة مش موجودة.')); return; }
  document.title = `${p.title} — Nuvio`;
  const head = el('div', 'pl-head');
  const cover = el('div', 'pl-cover');
  if (p.videos[0]) { const img = el('img'); img.alt = ''; img.src = ytThumb(p.videos[0].id, 'hqdefault'); cover.append(img); }
  else { cover.classList.add('empty-stack'); cover.innerHTML = window.ico ? window.ico('list') : ''; }
  const info = el('div', 'pl-info');
  const t = el('h1', 'pl-title', p.title); t.dir = 'auto';
  info.append(t, el('div', 'muted', `قائمتك · ${nf.format(p.videos.length)} فيديو`));
  const btns = el('div', 'pl-btns');
  const play = el('button', 'btn btn-main', '▶ شغّل الكل'); play.disabled = !p.videos.length;
  play.onclick = () => playList(p.videos, p.title, false, p.id);
  const shf = el('button', 'btn', '🔀 عشوائي'); shf.disabled = p.videos.length < 2;
  shf.onclick = () => playList(p.videos, p.title, true, p.id);
  const more = el('button', 'btn', '⋮');
  more.onclick = () => openSheet(p.title, [
    ['folder', 'غيّر الاسم', async () => { const n = await askText('اسم جديد للقائمة', '', p.title); if (n) { p.title = n; plists.save(p); renderUserPlaylist(id); } }],
    ['ban', 'امسح القائمة', () => { if (confirm(`تمسح «${p.title}»؟`)) { plists.remove(id); location.hash = '#/me'; } }],
  ]);
  btns.append(play, shf, more);
  info.append(btns);
  head.append(cover, info);
  view.replaceChildren(head);
  if (!p.videos.length) { view.append(el('div', 'empty', 'القائمة فاضية. من زر ⋮ على أي فيديو اختار «ضيف لقائمة تشغيل».')); return; }
  const g = el('div', 'grid');
  p.videos.forEach(v => {
    const c = card(v);
    const x = el('button', 'card-x', '✕'); x.title = 'شيل من القائمة';
    x.onclick = e => { e.preventDefault(); e.stopPropagation(); plists.toggle(id, v); c.remove(); };
    c.querySelector('.thumb').append(x);
    g.append(c);
  });
  view.append(g);
}
// قسم «قوائم التشغيل» بصفحة «أنا»
function mePlaylistsSection() {
  const box = el('div', 'me-sec');
  const head = sectionHead('قوائم التشغيل', null, 'list');
  const add = el('button', 'sec-more sec-add', '+ قائمة جديدة');
  add.onclick = async () => { const p = await newPlaylist(); if (p) location.hash = `#/plist?id=${p.id}`; };
  head.append(add);
  const rows = el('div', 'lib-rows');
  const n = x => `${nf.format(x)} فيديو`;
  const later = queue.list();
  rows.append(libRow('#/later', 'شغّل بعدين', later.length ? n(later.length) : 'فاضية', later[0] && later[0].id, 'later'));
  plists.all().forEach(p => rows.append(libRow(`#/plist?id=${p.id}`, p.title, `قائمتك · ${n(p.videos.length)}`, p.videos[0] && p.videos[0].id, 'list')));
  store.get('ytlists', []).forEach(l => rows.append(libRow(`#/list?id=${encodeURIComponent(l.id)}`, l.title || 'قائمة تشغيل', n(l.videos.length), l.videos[0] && l.videos[0].id, 'folder')));
  box.append(head, rows);
  return box;
}

/* ================= صفحة «أنا» ================= */
function renderMe() {
  document.title = 'أنا — Nuvio';
  const head = el('div', 'me-head');
  const me = accUser();
  const av = el('div', 'me-av', me ? (me.name || me.email).trim().charAt(0).toUpperCase() : 'N');
  const nm = el('div', 'me-name');
  if (me) { const n = el('b', null, me.name || me.email); n.dir = 'auto'; const e = el('span', 'muted', me.email); e.dir = 'ltr'; nm.append(n, e); }
  else nm.append(el('b', null, 'ضيف Nuvio'), el('span', 'muted', 'بياناتك على هالجهاز بس — سجّل دخول لتنحفظ بحسابك'));
  const gear = el('a', 'me-gear'); gear.href = '#/settings'; gear.setAttribute('aria-label', 'الإعدادات');
  gear.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.5 7.5 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4 1 2-3.4z"/></svg>';
  head.append(av, nm, gear);
  const acts = el('div', 'me-acts');
  if (me) {
    if (me.admin) { const adm = el('a', 'me-btn soon', 'لوحة التحكّم'); adm.href = '#/admin'; acts.append(adm); }
    const link = el('button', 'me-btn', 'سجّل دخول جهاز تاني'); link.onclick = openScanner;
    const out = el('button', 'me-btn', 'تسجيل خروج'); out.onclick = confirmLogout;
    acts.append(link, out);
  } else {
    const login = el('a', 'me-btn soon', 'تسجيل الدخول'); login.href = '#/login';
    const reg = el('a', 'me-btn', 'حساب جديد'); reg.href = '#/login?m=register';
    const qr = el('button', 'me-btn', 'دخول بـ QR'); qr.onclick = showQrLogin;
    acts.append(login, reg, qr);
  }
  const body = liveSection(['hist', 'likes', 'favs', 'later', 'mhist', 'artists', 'subs', 'ytlists', 'playlists', 'searches', 'pos'], () => {
    const rows = el('div', 'lib-rows');
    rows.append(
      libRow('#/subs', 'القنوات المشترك فيها', `${nf.format(subs.list().length)} قناة`, null, 'subs'),
      libRow('#/music/fav', 'المطربين المفضّلين', `${nf.format(artists.list().length)} مطرب`, null, 'star'),
      libRow('#/searches', 'سجل البحث', `${nf.format(store.get('searches', []).length)} بحث`, null, 'search'),
    );
    return [meLibSection('shorts'), meLibSection('videos'), meLibSection('music'), mePlaylistsSection(), sectionHead('كمان', null, 'folder'), rows];
  });
  view.replaceChildren(head, acts, body);
}

/* ================= صفحة الإعدادات ================= */
function renderSettings() {
  document.title = 'الإعدادات — Nuvio';
  const box = el('div', 'settings-page');
  const top = el('div', 'set-top');
  const back = el('a', 'set-back', '›'); back.href = '#/me';
  top.append(back, el('h1', null, 'الإعدادات'));
  box.append(top);
  const sep = t => el('div', 'drawer-sep', t);
  drawerSettings(box, sep, () => {});
  // الشورتس
  const SH = el('div');
  const sw = (icon, label, get, set, hint) => {
    const b = el('button', 'drawer-item drawer-tg');
    const ic = el('span', 'drawer-ico'); ic.innerHTML = window.ico ? window.ico(icon) : '';
    const tx = el('span', 'drawer-tx'); tx.append(el('span', null, label)); if (hint) tx.append(el('small', 'muted', hint));
    const s = el('span', 'np-sw' + (get() ? ' on' : '')); s.append(el('span'));
    b.append(ic, tx, s);
    b.onclick = () => { set(!get()); s.classList.toggle('on', !!get()); };
    return b;
  };
  const rateBtn = el('button', 'drawer-item');
  const ric = el('span', 'drawer-ico'); ric.innerHTML = window.ico ? window.ico('spark') : '';
  const rval = el('span', 'drawer-count', (+prefs.get('shortsRate') || 1) === 1 ? 'عادي' : `${prefs.get('shortsRate')}×`);
  rateBtn.append(ric, el('span', 'drawer-tx', 'سرعة الشورتس'), rval);
  rateBtn.onclick = () => { const i = SPEEDS_S.indexOf(+prefs.get('shortsRate') || 1); const nx = SPEEDS_S[(i + 1) % SPEEDS_S.length]; prefs.set('shortsRate', nx); rval.textContent = nx === 1 ? 'عادي' : `${nx}×`; };
  SH.append(sep('الشورتس'), sw('shorts', 'تشغيل تلقائي للشورتس', () => prefs.get('shortsAuto'), x => prefs.set('shortsAuto', x), 'لمّا يخلص الشورت بينقل للّي بعدو'), rateBtn);
  // الصفحة الرئيسية: الأقسام اللي فوق «مقترح لك» — بتطفيها أو بترتّبها
  const HS = el('div');
  const drawHS = () => {
    const list = homeSecs();
    const save = l => { prefs.set('homeSecs', l); drawHS(); };
    HS.replaceChildren(sep('الصفحة الرئيسية'));
    list.forEach((s, i) => {
      const [, label, icon] = HOME_SECS.find(([k]) => k === s.k);
      const row = el('div', 'drawer-item drawer-tg home-sec' + (s.on ? '' : ' off'));
      row.setAttribute('role', 'button'); row.tabIndex = 0;
      const ic = el('span', 'drawer-ico'); ic.innerHTML = window.ico ? window.ico(icon) : '';
      const tx = el('span', 'drawer-tx'); tx.append(el('span', null, label), el('small', 'muted', s.on ? 'ظاهر بالرئيسية' : 'مخفي'));
      const up = el('button', 'hs-move'); up.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>'; up.setAttribute('aria-label', 'لفوق'); up.disabled = i === 0;
      const dn = el('button', 'hs-move'); dn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>'; dn.setAttribute('aria-label', 'لتحت'); dn.disabled = i === list.length - 1;
      up.onclick = e => { e.stopPropagation(); const l = homeSecs(); [l[i - 1], l[i]] = [l[i], l[i - 1]]; save(l); };
      dn.onclick = e => { e.stopPropagation(); const l = homeSecs(); [l[i + 1], l[i]] = [l[i], l[i + 1]]; save(l); };
      const swEl = el('span', 'np-sw' + (s.on ? ' on' : '')); swEl.append(el('span'));
      const toggle = () => { const l = homeSecs(); l[i].on = !l[i].on; save(l); };
      row.onclick = toggle;
      row.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
      row.append(ic, tx, up, dn, swEl);
      HS.append(row);
    });
    if (list.every(s => !s.on)) HS.append(el('div', 'set-note muted', 'كلهن مطفيين: الرئيسية رح يطلع فيها «مقترح لك» بس.'));
  };
  drawHS();
  // نقل «الصفحة الرئيسية» والشورتس قبل «بياناتك»
  const dataSep = [...box.querySelectorAll('.drawer-sep')].find(s => s.textContent === 'بياناتك');
  if (dataSep) { box.insertBefore(HS, dataSep); box.insertBefore(SH, dataSep); } else box.append(HS, SH);
  const about = el('div', 'set-about');
  about.append(el('div', null, `Nuvio · النسخة ${typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''}`), el('div', 'muted', 'بلا إعلانات · كل بياناتك على جهازك'));
  box.append(sep('حول'), about);
  view.replaceChildren(box);
}
