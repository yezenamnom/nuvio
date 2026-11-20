/* Nuvio — ميزات إضافية: الإعدادات، النسخة الاحتياطية، «كمّل من وين وقفت»، تخطّي الدعايات جوّا الفيديو،
   فصول الفيديو، التشغيل التلقائي و«شغّل بعدين»، «مش مهتم»، علامة «جديد» عالقنوات، توفير الإنترنت، والشورتس.
   كل شي محفوظ على جهازك بس.
   (بينحمّل قبل app.js: هون بس تعريفات، وما في شي بيشتغل لحالو وقت التحميل) */
'use strict';

/* ================= الإعدادات ================= */
const PREF_DEFAULTS = { autoplay: true, sb: true, hideWatched: true, saver: 'auto' };
const prefs = {
  get: k => { const p = store.get('prefs', {}); return k in p ? p[k] : PREF_DEFAULTS[k]; },
  set: (k, v) => { const p = store.get('prefs', {}); p[k] = v; store.set('prefs', p); },
};
window.nuvioPref = prefs;
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
  const q = queue.list().filter(v => v.id !== curId);
  if (q.length) return { v: q[0], fromQueue: true };
  if (!force && !prefs.get('autoplay')) return null;
  const all = (related || []).filter(v => v && v.id && v.id !== curId && !v.live);
  const fresh = all.filter(v => wanted(v) && (music || !isWatched(v.id)));
  const v = fresh[0] || all.find(wanted) || all[0];
  return v ? { v } : null;
}
function goNext(nx) {
  if (!nx) return;
  if (nx.fromQueue) queue.remove(nx.v.id);
  preview.set(nx.v.id, nx.v);
  openInMini = !!miniOn;
  location.hash = `#/watch?v=${encodeURIComponent(nx.v.id)}`;
}
// «الجاي» فوق الفيديو لمّا يخلص، مع عدّ تنازلي وزر إلغاء
function showUpNext(box, nx) {
  const old = box.querySelector('.np-next'); if (old) old.remove();
  const o = el('div', 'np-next'); o.dir = 'rtl';
  const head = el('div', 'np-next-t', nx.fromQueue ? 'الجاي من «شغّل بعدين»' : 'الفيديو الجاي');
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
    ['share', 'مشاركة', () => shareVideo(v)],
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
  try {
    const list = subs.list().slice(0, 40);
    const tops = chNew.tops(), seen = chNew.seen();
    let changed = false;
    for (let i = 0; i < list.length; i += 3) {
      await Promise.all(list.slice(i, i + 3).map(c => getChannel(c.id).then(({ res }) => {
        const top = res && res.items && res.items[0] && res.items[0].id;
        if (!top) return;
        if (!tops[c.id] || tops[c.id].top !== top) { tops[c.id] = { top, at: Date.now() }; changed = true; }
        if (!(c.id in seen)) { seen[c.id] = top; changed = true; } // أول مرة: هيدا الأساس، بلا نقطة
      }).catch(() => {})));
    }
    if (changed) { store.set('chSeen', seen); store.set('chTop', tops); }
  } finally { chRefreshing = false; }
}

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
const saverCfg = () => (saverOn()
  ? { abr: { restrictions: { maxHeight: 480 }, defaultBandwidthEstimate: 6e5 } }
  : { abr: { restrictions: { maxHeight: Infinity } } });

/* ================= النسخة الاحتياطية ================= */
const BACKUP_KEYS = ['hist', 'likes', 'favs', 'mhist', 'subs', 'artists', 'ytlists', 'searches', 'later', 'pos', 'nope', 'nopeCh', 'chSeen', 'chTop', 'prefs', 'mode'];
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
  arrById('hist', 500); arrById('mhist', 500); arrById('likes'); arrById('favs'); arrById('subs'); arrById('artists'); arrById('ytlists');
  if (Array.isArray(d.later)) { const cur = queue.list(); const have = new Set(cur.map(x => x.id)); const add = d.later.filter(x => x && x.id && !have.has(x.id)); if (add.length) { n += add.length; store.set('later', cur.concat(add).slice(-200)); } }
  if (Array.isArray(d.searches)) { const cur = store.get('searches', []); const low = new Set(cur.map(s => String(s).toLowerCase())); const add = d.searches.filter(s => typeof s === 'string' && !low.has(s.toLowerCase())); if (add.length) { n += add.length; store.set('searches', cur.concat(add).slice(0, 40)); } }
  for (const k of ['nope', 'nopeCh']) if (Array.isArray(d[k])) { const cur = store.get(k, []); const set = new Set(cur); const add = d[k].filter(x => !set.has(x)); if (add.length) store.set(k, cur.concat(add).slice(0, 2000)); }
  for (const k of ['pos', 'chSeen', 'chTop']) if (d[k] && typeof d[k] === 'object') store.set(k, { ...d[k], ...store.get(k, {}) });
  if (d.prefs && typeof d.prefs === 'object') store.set('prefs', { ...d.prefs, ...store.get('prefs', {}) });
  if (j.player && typeof j.player === 'object') for (const [k, v] of Object.entries(j.player)) if (localStorage.getItem('nuvio:p:' + k) == null) try { localStorage.setItem('nuvio:p:' + k, JSON.stringify(v)); } catch { /* */ }
  return n;
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
  const stx = el('span', 'drawer-tx'); stx.append(el('span', null, 'توفير الإنترنت'), el('small', 'muted', 'جودة 480p على بيانات الموبايل'));
  saverBtn.append(sic, stx, sval);
  saverBtn.onclick = () => {
    const order = ['auto', 'on', 'off'];
    const nx = order[(order.indexOf(prefs.get('saver')) + 1) % 3];
    prefs.set('saver', nx); sval.textContent = SAVER[nx];
    if (typeof player !== 'undefined' && player) try { player.configure(saverCfg()); } catch { /* */ }
  };
  const hidden = store.get('nope', []).length + store.get('nopeCh', []).length;
  const rows = [
    sep('الإعدادات'),
    sw('play', 'تشغيل تلقائي', () => prefs.get('autoplay'), v => prefs.set('autoplay', v), 'لمّا يخلص الفيديو بيبلّش اللي بعدو'),
    sw('skip', 'تخطّي الدعايات جوّا الفيديو', () => prefs.get('sb'), v => prefs.set('sb', v), 'بخدمة SponsorBlock المجانية'),
    sw('eye', 'خبّي اللي شفتو من المقترحات', () => prefs.get('hideWatched'), v => prefs.set('hideWatched', v)),
    saverBtn,
    hidden ? act('ban', `رجّع اللي خبّيتو (${nf.format(hidden)})`, () => { store.set('nope', []); store.set('nopeCh', []); note('رجعوا كلهن للمقترحات'); }) : null,
    sep('بياناتك'),
    act('download', 'صدّر نسخة احتياطية', exportBackup),
    act('upload', 'استورد من ملف', importBackup),
  ];
  d.append(...rows.filter(Boolean));
}

/* ================= الشورتس: مشغّل بالطول، بتنقل بسحبة ================= */
let shortsState = null;
let shortsCtx = null; // { ch, items } — من صفحة القناة
function shortsExit() {
  const s = shortsState; if (!s) return;
  shortsState = null;
  document.body.classList.remove('shorts-mode');
  if (s.io) s.io.disconnect();
  try { s.video.pause(); } catch { /* */ }
  if (s.sp) s.sp.destroy().catch(() => {});
}
async function shortManifest(id) {
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
function shortsFeed() {
  const qs = shuffle(store.get('searches', []).slice(0, 6)).concat(shuffle(['مضحك', 'طبخ', 'رياضة', 'حيوانات', 'سفر', 'كرة قدم', 'موسيقى', 'تقنية', 'funny', 'satisfying']));
  let i = 0;
  return async () => {
    while (i < qs.length) {
      try { const items = await ytShortsSearch(qs[i++]); if (items.length) return shuffle(items); } catch { /* اللي بعدو */ }
    }
    return [];
  };
}
const homeShorts = () => cached('home-shorts', 30 * 60e3, async () => {
  const f = shortsFeed(); let all = [];
  for (let k = 0; k < 2 && all.length < 12; k++) all = all.concat(await f());
  return uniqById(all).slice(0, 16);
});
// بطاقة شورت بالطول (للرفوف)
function shortCard(v, list) {
  const a = el('a', 'short-card'); a.href = `#/shorts?v=${encodeURIComponent(v.id)}`; a.dataset.vid = v.id;
  const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
  img.src = `https://i.ytimg.com/vi/${v.id}/oardefault.jpg`;
  img.onerror = () => { if (!img.dataset.f) { img.dataset.f = '1'; img.src = ytThumb(v.id, 'hqdefault'); } };
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
  const video = document.createElement('video');
  video.playsInline = true; video.setAttribute('playsinline', ''); video.loop = true; video.preload = 'auto';
  video.className = 'short-video';
  try { video.volume = JSON.parse(localStorage.getItem('nuvio:p:vol') || '1'); } catch { /* */ }
  const drawMute = () => { mute.innerHTML = video.muted ? '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z"/><path class="s" d="M16 9.5l5 5M21 9.5l-5 5"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z"/><path class="s" d="M15.5 8.8a4.5 4.5 0 0 1 0 6.4M18.2 6.2a8.2 8.2 0 0 1 0 11.6"/></svg>'; };
  mute.onclick = e => { e.stopPropagation(); video.muted = !video.muted; drawMute(); if (!video.muted) video.play().catch(() => {}); };
  video.addEventListener('volumechange', drawMute); drawMute();
  const s = shortsState = { wrap, video, sp: null, cur: null, seq: 0, seen: new Set(), more: null, busy: false };
  view.replaceChildren(wrap, back, mute, nav);

  const sideBtn = (icon, label, on, fn) => {
    const b = el('button', 'short-btn' + (on ? ' on' : ''));
    const i = el('span', 'short-ico'); i.innerHTML = window.ico ? window.ico(icon) : '';
    b.append(i, el('span', null, label));
    b.onclick = e => { e.stopPropagation(); const r = fn(); if (typeof r === 'boolean') b.classList.toggle('on', r); };
    return b;
  };
  const like = (sl, v) => {
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
    poster.src = `https://i.ytimg.com/vi/${v.id}/oardefault.jpg`;
    poster.onerror = () => { if (!poster.dataset.f) { poster.dataset.f = '1'; poster.src = ytThumb(v.id, 'hqdefault'); } };
    const spin = el('div', 'short-spin');
    const info = el('div', 'short-info');
    if (v.author) { const a = el(v.authorId ? 'a' : 'span', 'short-ch', '@' + v.author.replace(/^@/, '')); if (v.authorId) a.href = chHref(v.authorId); a.dir = 'auto'; info.append(a); }
    const t = el('div', 'short-title', v.title || ''); t.dir = 'auto'; info.append(t);
    const side = el('div', 'short-side');
    side.append(
      sideBtn('like', 'إعجاب', lib.has('likes', v.id), () => lib.toggle('likes', v)),
      sideBtn('saved', 'حفظ', lib.has('favs', v.id), () => lib.toggle('favs', v)),
      sideBtn('later', 'بعدين', queue.has(v.id), () => queue.toggle(v)),
      sideBtn('share', 'مشاركة', false, () => shareVideo(v)),
    );
    // شريط تقدّم بتقدر تسحبو
    const bar = el('div', 'short-bar'); bar.dir = 'ltr'; const fill = el('i'); bar.append(fill);
    const seek = e => { const r = bar.getBoundingClientRect(); const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); if (s.cur === sl && video.duration) video.currentTime = f * video.duration; };
    bar.addEventListener('pointerdown', e => { e.stopPropagation(); bar.setPointerCapture(e.pointerId); bar.classList.add('drag'); seek(e); });
    bar.addEventListener('pointermove', e => { if (bar.classList.contains('drag')) seek(e); });
    bar.addEventListener('pointerup', e => { e.stopPropagation(); bar.classList.remove('drag'); });
    const pp = el('div', 'short-pp');
    const fast = el('div', 'short-fast', '2× ⏩');
    const fail = el('div', 'short-fail');
    const retry = el('button', null, 'جرّب مرة تانية'); retry.onclick = e => { e.stopPropagation(); sl.classList.remove('fail'); load(v, sl); };
    fail.append(el('div', null, 'ما قدرت شغّل هالفيديو هلّق'), retry);
    sl.append(poster, spin, info, side, bar, pp, fast, fail);
    // كبسة = إيقاف/تشغيل، كبستين = إعجاب، ضغطة مطوّلة = 2×
    let tapT = 0, lastTap = 0, holdT = 0, held = false;
    sl.addEventListener('pointerdown', e => {
      if (e.target.closest('a, button, .short-bar') || s.cur !== sl) return;
      clearTimeout(holdT);
      holdT = setTimeout(() => { held = true; video.playbackRate = 2; sl.classList.add('fast'); if (video.paused) video.play().catch(() => {}); }, 450);
    });
    const endHold = () => { clearTimeout(holdT); if (held) { held = false; video.playbackRate = 1; sl.classList.remove('fast'); return true; } return false; };
    sl.addEventListener('pointercancel', endHold);
    sl.addEventListener('pointerleave', endHold);
    sl.addEventListener('pointerup', e => {
      if (endHold()) return;
      if (e.target.closest('a, button, .short-bar') || s.cur !== sl) return;
      const now = Date.now();
      if (now - lastTap < 300) { clearTimeout(tapT); lastTap = 0; like(sl, v); return; }
      lastTap = now;
      clearTimeout(tapT);
      tapT = setTimeout(() => {
        if (video.muted) { video.muted = false; video.play().catch(() => {}); return; }
        if (video.paused) video.play().catch(() => {}); else video.pause();
      }, 260);
    });
    sl.addEventListener('contextmenu', e => e.preventDefault());
    wrap.append(sl);
    s.io.observe(sl);
  };
  const load = async (v, sl) => {
    const my = ++s.seq;
    video.pause();
    sl.classList.add('loading'); sl.classList.remove('ready', 'fail');
    try {
      if (!s.sp) {
        s.sp = new shaka.Player();
        await s.sp.attach(video);
        s.sp.getNetworkingEngine().registerRequestFilter(async (type, req) => { req.uris = await Promise.all(req.uris.map(fixUrl)); });
        s.sp.configure({ preferredVideoCodecs: ['avc1', 'vp9'], streaming: { bufferingGoal: 12, rebufferingGoal: 0.3 }, abr: { enabled: true, defaultBandwidthEstimate: 2e6 } });
      }
      s.sp.configure(saverCfg());
      let ok = false;
      try {
        const mf = await shortManifest(v.id);
        if (my !== s.seq) return;
        await s.sp.load(toDataUri(mf.text, 'application/dash+xml'), 0, 'application/dash+xml');
        ok = true;
      } catch { /* جرّب mp4 */ }
      if (!ok) {
        const { res } = await getVideo(v.id);
        if (my !== s.seq) return;
        const mp4 = res.sources.find(x => x.kind === 'mp4');
        if (!mp4) throw new Error('ما في مصدر');
        await s.sp.load(await fixUrl(mp4.url), 0, 'video/mp4');
      }
      if (my !== s.seq) return;
      try { await video.play(); } catch {
        // الآيفون ما بيسمح بالصوت بلا كبسة: منشغّل بلا صوت، وكبسة وحدة بترجّعو
        video.muted = true; video.play().catch(() => {});
      }
      lib.add('hist', v);
    } catch {
      if (my === s.seq) { sl.classList.remove('loading'); sl.classList.add('fail'); }
    }
  };
  const activate = sl => {
    if (s.cur === sl) return;
    if (s.cur) s.cur.classList.remove('active', 'ready', 'paused', 'fast');
    s.cur = sl; sl.classList.add('active');
    sl.insertBefore(video, sl.children[1] || null);
    video.playbackRate = 1;
    load(sl._v, sl);
    // جهّز اللي بعدو (ملف الفيديو بيكون جاهز لمّا توصلو)
    const nx = sl.nextElementSibling;
    if (nx && nx._v) shortManifest(nx._v.id).catch(() => {});
    const kids = [...wrap.children];
    if (kids.length - kids.indexOf(sl) < 4) loadMore();
  };
  s.io = new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting && e.intersectionRatio >= 0.6) activate(e.target);
  }, { root: wrap, threshold: [0.6] });
  video.addEventListener('timeupdate', () => {
    const b = s.cur && s.cur.querySelector('.short-bar i');
    if (b && video.duration) b.style.width = `${(video.currentTime / video.duration) * 100}%`;
  });
  // الصورة بتضل لحد ما يبلّش الفيديو فعلاً (بدل شاشة سودا)
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
      s.more = async () => {
        if (!fetched) { fetched = true; const r = await channelTab(ch, 'shorts'); next = r.next; return r.items; }
        if (!next) return [];
        const r = await channelTab(ch, 'shorts', '', next); next = r.next; return r.items;
      };
    } else {
      s.more = shortsFeed();
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
window.addEventListener('nuvio:store', e => { if (['chTop', 'chSeen', 'subs'].includes(e.detail)) updateBottomNav(); });
function updateBottomNav() {
  const nav = document.querySelector('.bnav'); if (!nav) return;
  const path = (location.hash.slice(1) || '/').split('?')[0];
  const sec = path.startsWith('/music') ? '/music' : ['/history', '/likes', '/favs', '/later', '/searches', '/lists', '/list'].includes(path) ? '/me' : path;
  nav.querySelectorAll('.bnav-i').forEach(a => a.classList.toggle('on', a.dataset.path === sec));
  const subsBtn = nav.querySelector('[data-path="/subs"]');
  if (subsBtn) subsBtn.classList.toggle('dot', subs.list().some(c => chNew.has(c.id)));
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
function renderMe(filter = 'all') {
  document.title = 'أنا — Nuvio';
  // الراس
  const head = el('div', 'me-head');
  const av = el('div', 'me-av', 'N');
  const nm = el('div', 'me-name');
  nm.append(el('b', null, 'ضيف Nuvio'), el('span', 'muted', 'كل شي محفوظ على جهازك بس'));
  head.append(av, nm);
  const acts = el('div', 'me-acts');
  const login = el('button', 'me-btn soon', 'تسجيل دخول · قريباً'); login.disabled = true;
  const bak = el('button', 'me-btn', 'نسخة احتياطية');
  bak.onclick = () => openSheet('نسخة احتياطية لبياناتك', [
    ['download', 'صدّر نسخة احتياطية', exportBackup],
    ['upload', 'استورد من ملف', importBackup],
  ]);
  acts.append(login, bak);
  // السجل (رف) + المكتبة — بيتحدّثوا لحالهن
  const body = liveSection(['hist', 'likes', 'favs', 'later', 'mhist', 'artists', 'subs', 'ytlists', 'searches', 'pos'], () => {
    const out = [];
    const hist = lib.list('hist').slice(0, 20);
    if (hist.length) {
      const shelf = el('div', 'shelf');
      hist.forEach(v => shelf.append(card(v)));
      out.push(sectionHead('السجل', '#/history', 'clock'), shelf);
    }
    out.push(sectionHead('مكتبتك', null, 'folder'));
    const chips = el('div', 'filter-bar');
    [['all', 'الكل'], ['lists', 'قوائم التشغيل'], ['music', 'الموسيقى']].forEach(([k, label]) => {
      const b = el('button', 'f-chip' + (k === filter ? ' on' : ''), label);
      b.onclick = () => renderMe(k);
      chips.append(b);
    });
    out.push(chips);
    const rows = el('div', 'lib-rows');
    const n = x => `${nf.format(x)} ${x === 1 ? 'فيديو' : 'فيديو'}`;
    const first = k => (lib.list(k)[0] || {}).id;
    const later = queue.list();
    if (filter !== 'music') {
      rows.append(
        libRow('#/later', 'شغّل بعدين', later.length ? n(later.length) : 'فاضية', later[0] && later[0].id, 'later'),
        libRow('#/likes', 'الإعجابات', n(lib.list('likes').length), first('likes'), 'like'),
        libRow('#/favs', 'المحفوظة', n(lib.list('favs').length), first('favs'), 'saved'),
      );
      store.get('ytlists', []).forEach(l => rows.append(libRow(`#/list?id=${encodeURIComponent(l.id)}`, l.title || 'قائمة تشغيل', n(l.videos.length), l.videos[0] && l.videos[0].id, 'list')));
    }
    if (filter !== 'lists') {
      rows.append(
        libRow('#/music/hist', 'السجل السماعي', n(lib.list('mhist').length), first('mhist'), 'phones'),
        libRow('#/music/fav', 'المطربين المفضّلين', `${nf.format(artists.list().length)} مطرب`, null, 'star'),
      );
    }
    if (filter === 'all') {
      rows.append(
        libRow('#/subs', 'القنوات المشترك فيها', `${nf.format(subs.list().length)} قناة`, null, 'subs'),
        libRow('#/searches', 'سجل البحث', `${nf.format(store.get('searches', []).length)} بحث`, null, 'search'),
      );
    }
    out.push(rows);
    return out;
  });
  // الإعدادات تحت (نفس اللي بالقائمة الجانبية)
  const set = el('div', 'me-settings');
  drawerSettings(set, t => el('div', 'drawer-sep', t), () => {});
  view.replaceChildren(head, acts, body, set);
}
