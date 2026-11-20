/* Nuvio Music + القائمة الجانبية + التبديل بين Nuvio و Nuvio Music.
   - ضغطة مطوّلة على اللوغو فوق: بتختار Nuvio (فيديوهات) أو Nuvio Music (أغاني).
   - القائمة الجانبية (☰): الاشتراكات، السجل، الإعجابات، المحفوظة، المطربين المفضّلين…
   - Nuvio Music: رئيسية بأقسام (الأكثر انتشاراً، جديد، عربي، خليجي، شامي…)، المطربين المفضّلين،
     السجل السماعي، وبودكاست. الأقسام بتتحمّل بس لمّا توصلها بالتمرير.
   (هالملف بيستعمل أدوات app.js وقت التشغيل.) */
'use strict';

/* ================= أيقونات SVG (بدل الإيموجي) ================= */
const ICO = {
  home: '<path d="M3.5 11L12 4l8.5 7v8.5a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/>',
  subs: '<rect x="3" y="5" width="18" height="13" rx="2.5"/><path d="M10 9.3v5.4l4.6-2.7z"/><path d="M8 21h8"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  like: '<path d="M7 10v10H4V10h3zm2.5 10h7.3a2 2 0 0 0 2-1.6l1.4-6.6A2 2 0 0 0 18.2 9.5H14l.7-3.6A1.6 1.6 0 0 0 12 4.6L9.5 8.3V20z"/>',
  saved: '<path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-3.8-6.5 3.8v-16a1 1 0 0 1 1-1z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  folder: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
  music: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  phones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4.5" height="6.5" rx="1.5"/><rect x="16.5" y="14" width="4.5" height="6.5" rx="1.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
  fire: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.2 3.6-7.8.4 1.9 1.6 3 2.6 3.4-.3-2.9.9-5.8 3.3-7.4-.2 2.6.8 4.6 2.2 6.4 1 1.3 1.8 2.9 1.8 5.1C19 18.3 16 21 12 21z"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.7 5.4 3.7 8.5s-1.2 5.9-3.7 8.5c-2.5-2.6-3.7-5.4-3.7-8.5s1.2-5.9 3.7-8.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  mountain: '<path d="M3 19.5l6.5-11 4 6.5 2.5-4 5 8.5z"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  coffee: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17M8 3.5v2M11.5 3.5v2"/>',
  laptop: '<rect x="4" y="5" width="16" height="10.5" rx="1.5"/><path d="M2.5 19h19"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19"/>',
  bolt: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  list: '<path d="M4 6h16M4 12h10M4 18h7"/><path d="M17 15v6l4.5-3z"/>',
};
const ico = window.ico = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICO[name] || ''}</svg>`;

/* ================= الوضع: فيديو أو ميوزك ================= */
const isMusic = () => { try { return JSON.parse(localStorage.getItem('nuvio:mode') || '"video"') === 'music'; } catch { return false; } };
let brandTimer = null;
function setMode(m, animate) {
  const was = isMusic() ? 'music' : 'video';
  try { localStorage.setItem('nuvio:mode', JSON.stringify(m)); } catch { /* */ }
  document.body.classList.toggle('music-mode', m === 'music');
  const name = document.querySelector('.brand-name');
  if (!name) return;
  const short = m === 'music' ? 'NM' : 'N';
  const full = m === 'music' ? 'Nuvio Music' : 'Nuvio';
  clearTimeout(brandTimer);
  if (animate || was !== m) {
    // أول شي بيطلع الاسم الكامل مع اللوغو، وبعدين بيصغر لحرفين
    name.textContent = full;
    name.classList.remove('shrink'); void name.offsetWidth;
    name.classList.add('intro');
    document.querySelector('.logo')?.classList.add('pulse');
    brandTimer = setTimeout(() => {
      name.classList.add('shrink');
      brandTimer = setTimeout(() => { name.textContent = short; name.classList.remove('intro', 'shrink'); document.querySelector('.logo')?.classList.remove('pulse'); }, 320);
    }, 1700);
  } else name.textContent = short;
}

/* ================= المطربين المفضّلين ================= */
const artists = {
  list: () => store.get('artists', []),
  has: id => store.get('artists', []).some(a => a.id === id),
  toggle(a) {
    const arr = store.get('artists', []);
    const i = arr.findIndex(x => x.id === a.id);
    if (i >= 0) { arr.splice(i, 1); store.set('artists', arr); return false; }
    arr.unshift({ id: a.id, name: a.name || '', avatar: a.avatar || '' });
    store.set('artists', arr);
    return true;
  },
};
function toggleArtist(a) {
  if (!a || !a.id) { note('ما عرفت مين المطرب'); return; }
  const on = artists.toggle(a);
  note(on ? `${a.name} صار بمطربينك المفضّلين` : `شلت ${a.name} من المفضّلين`);
}

/* ================= بحث موسيقي (مع ترتيب وتاريخ) ================= */
function musicSearch(q, o = {}, page = 1) {
  const key = 'ms:' + q + JSON.stringify(o) + ':' + page;
  return cached(key, 30 * 60e3, () => withFallback(i => {
    // أول صفحة من يوتيوب مباشرة (أسرع بكتير)، والصفحات اللي بعدها من السيرفرات العامة
    if (i.type === 'yti') return YtApi.search(i.url, q, 1, null, { sort: o.sort_by || o.sort, date: o.date, dur: o.duration, feat: o.features }).then(r => r.items);
    if (i.type !== 'invidious') return page === 1 ? apiFor(i).search(i.url, q, 1).then(r => r.items) : Promise.resolve([]);
    const extra = Object.entries(o).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
    return fetchJSON(`${i.url}/api/v1/search?q=${encodeURIComponent(q)}&type=video&page=${page}${extra}`)
      .then(d => (Array.isArray(d) ? d : []).filter(v => v.type === 'video').map(v => Invidious.item(i.url, v)));
  }, { yti: page === 1 })).then(r => r.res);
}

const MUSIC_SHELVES = [
  { t: 'الأكثر انتشاراً هالأسبوع', i: 'fire', q: 'أغنية', o: { sort_by: 'view_count', date: 'week' } },
  { t: 'أغاني جديدة', i: 'spark', q: 'أغنية جديدة 2026', o: { date: 'month' } },
  { t: 'عربي', i: 'music', q: 'أغاني عربية' },
  { t: 'خليجي', i: 'sun', q: 'أغاني خليجية' },
  { t: 'شامي', i: 'mountain', q: 'أغاني شامية' },
  { t: 'مصري', i: 'moon', q: 'أغاني مصرية' },
  { t: 'عالمي', i: 'globe', q: 'top hits official music video' },
  { t: 'طرب أصيل', i: 'mic', q: 'طرب أصيل' },
  { t: 'هادي', i: 'coffee', q: 'lofi chill music' },
];
const PODCAST_SHELVES = [
  { t: 'بودكاست عربي', i: 'mic', q: 'بودكاست' },
  { t: 'فنجان', i: 'coffee', q: 'بودكاست فنجان' },
  { t: 'تقنية', i: 'laptop', q: 'بودكاست تقني' },
  { t: 'تطوير الذات', i: 'book', q: 'بودكاست تطوير الذات' },
  { t: 'English podcasts', i: 'globe', q: 'podcast full episode' },
];
const TOP_ARTISTS = ['فيروز', 'أم كلثوم', 'عمرو دياب', 'نانسي عجرم', 'إليسا', 'محمد عبده', 'وائل كفوري', 'ماجد المهندس', 'أصالة', 'ناصيف زيتون', 'حسين الجسمي', 'تامر حسني', 'شيرين', 'راغب علامة'];

/* القناة الرسمية للمطرب: اللي إلها نسخة «- Topic» (يوتيوب بيعملها للفنانين بس)،
   وإلا أكبر قناة موثّقة مش «فاميلي/عائلة/معجبين» */
function officialArtist(list) {
  const bad = /فاميلي|family|عائلة|عيلة|kids|أطفال|fans|معجبين|fan club|vlog/i;
  // قنوات «Topic» (أغاني بس): بالإنجليزي «X - Topic» وبالعربي «الموضوع - X»
  const TOPIC = / - Topic$|^الموضوع - /;
  const norm = s => (s || '').replace(/ - Topic$/, '').replace(/^الموضوع - /, '').trim().toLowerCase();
  const good = list.filter(c => !bad.test(c.name) && !TOPIC.test(c.name));
  const topics = list.filter(c => TOPIC.test(c.name)).map(c => norm(c.name));
  // ١) قناة موثّقة إلها نسخة «Topic» بنفس الاسم = المطرب الرسمي
  const official = good.filter(c => c.verified && topics.includes(norm(c.name))).sort((a, b) => (b.subs || 0) - (a.subs || 0))[0];
  if (official) return official;
  // ٢) أكبر قناة موثّقة مش عيلة/معجبين
  const big = good.filter(c => c.verified).sort((a, b) => (b.subs || 0) - (a.subs || 0))[0];
  if (big) return big;
  // ٣) قناة Topic (أغاني بس) — بدون كلمة Topic بالاسم
  const tp = list.find(c => TOPIC.test(c.name));
  if (tp) return { ...tp, name: norm(tp.name) ? tp.name.replace(/ - Topic$/, '').replace(/^الموضوع - /, '') : tp.name };
  return good[0] || null;
}

/* رف أفقي بيتحمّل بس لمّا توصلو بالتمرير */
function lazyShelf(title, loader, href, icon) {
  const wrap = el('section', 'm-sec');
  wrap.append(sectionHead(title, href, icon));
  const shelf = el('div', 'shelf'); shelf.append(skCards(4));
  wrap.append(shelf);
  const io = new IntersectionObserver(async ents => {
    if (!ents.some(e => e.isIntersecting)) return;
    io.disconnect();
    try {
      const items = await loader();
      shelf.replaceChildren();
      if (!items.length) { wrap.remove(); return; }
      items.slice(0, 16).forEach(v => shelf.append(card(v)));
    } catch { wrap.remove(); }
  }, { rootMargin: '400px 0px' });
  io.observe(wrap);
  return wrap;
}

function musicTabs(active) {
  const bar = el('div', 'm-tabs');
  [['/music', 'الرئيسية'], ['/music/fav', 'المفضّلين'], ['/music/hist', 'السجل السماعي'], ['/music/podcast', 'بودكاست']].forEach(([p, t]) => {
    const a = el('a', 'm-tab' + (p === active ? ' on' : ''), t); a.href = '#' + p; bar.append(a);
  });
  return bar;
}

async function renderMusic(path, params) {
  setMode('music');
  document.title = 'Nuvio Music';
  if (path === '/music/more') {
    const k = (params && params.get('k')) || 'm0';
    const def = (k[0] === 'p' ? PODCAST_SHELVES : MUSIC_SHELVES)[+k.slice(1)] || MUSIC_SHELVES[0];
    view.replaceChildren(musicTabs(k[0] === 'p' ? '/music/podcast' : '/music'), sectionHead(def.t, null, def.i));
    const g = el('div', 'grid'); g.append(skCards(8)); view.append(g);
    let page = 1;
    const seen = new Set();
    const add = items => { let n = 0; items.forEach(v => { if (!seen.has(v.id)) { seen.add(v.id); g.append(card(v)); n++; } }); return n; };
    try {
      const first = await musicSearch(def.q, def.o, 1);
      g.replaceChildren(); add(first);
      infinite(g, async () => { page++; const more = await musicSearch(def.q, def.o, page); return add(more) > 0; });
    } catch { g.replaceWith(el('div', 'empty', 'ما قدرت جيب هالقسم هلّق.')); }
    return;
  }
  if (path === '/music/hist') { renderLibrary('mhist'); view.prepend(musicTabs(path)); return; }
  view.replaceChildren(musicTabs(path));

  if (path === '/music/podcast') {
    PODCAST_SHELVES.forEach((s, n) => view.append(lazyShelf(s.t, () => musicSearch(s.q, s.o), `#/music/more?k=p${n}`, s.i)));
    return;
  }

  if (path === '/music/fav') {
    const list = artists.list();
    view.append(liveSection(['artists'], () => {
      const l = artists.list();
      if (!l.length) return [sectionHead('المطربين المفضّلين (0)', null, 'star'), el('div', 'empty', 'لسا ما ضفت مطربين. وقت تسمع أغنية اكبس + بالمشغّل، أو «ضيف المطرب» من الزر العايم.')];
      const grid = el('div', 'sub-grid');
      l.forEach(a => grid.append(channelBubble(a)));
      return [sectionHead(`المطربين المفضّلين (${l.length})`, null, 'star'), grid];
    }));
    list.slice(0, 12).forEach(a => view.append(lazyShelf(a.name, () => getChannel(a.id).then(r => r.res.items), chHref(a.id))));
    return;
  }

  // الرئيسية: مطربينك (إذا في) + مطربين مشهورين + الأقسام
  const mine = artists.list();
  view.append(liveSection(['artists'], () => {
    const l = artists.list();
    if (!l.length) return [];
    const row = el('div', 'sub-strip');
    l.slice(0, 20).forEach(a => row.append(channelBubble(a)));
    return [sectionHead('مطربينك', '#/music/fav', 'star'), row];
  }));
  if (mine.length) {
    view.append(lazyShelf('من مطربينك', async () => {
      const res = await Promise.all(shuffle(mine).slice(0, 5).map(a => getChannel(a.id).then(r => r.res.items.slice(0, 4)).catch(() => [])));
      return shuffle(res.flat());
    }, null, 'star'));
  }
  const top = el('div', 'sub-strip');
  view.append(sectionHead('مطربين', null, 'mic'), top);
  (async () => {
    for (const name of TOP_ARTISTS) {
      try {
        const { res } = await cached('ma3:' + name, 24 * 3600e3, () => withFallback(i => i.type === 'yti' ? YtApi.channels(i.url, name, 8) : fetchJSON(`${i.url}/api/v1/search?q=${encodeURIComponent(name)}&type=channel&page=1`)
          .then(d => (Array.isArray(d) ? d : []).filter(c => c.type === 'channel').map(c => ({ id: c.authorId, name: c.author, avatar: Invidious.pickAvatar(i.url, c.authorThumbnails), subs: c.subCount, verified: c.authorVerified }))), { yti: true }));
        const c = officialArtist(res || []);
        if (c && top.isConnected) top.append(channelBubble({ id: c.id, name: c.name, avatar: c.avatar }));
      } catch { /* */ }
    }
  })();
  MUSIC_SHELVES.forEach((s, n) => view.append(lazyShelf(s.t, () => musicSearch(s.q, s.o), `#/music/more?k=m${n}`, s.i)));
}

/* ================= القائمة الجانبية ☰ ================= */
function openDrawer() {
  let ov = document.querySelector('.drawer-ov');
  if (!ov) {
    ov = el('div', 'drawer-ov');
    const d = el('aside', 'drawer');
    ov.append(d);
    ov.onclick = e => { if (e.target === ov) closeDrawer(); };
    document.body.append(ov);
    // سحب لليمين بيسكّرها
    let x0 = null;
    d.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    d.addEventListener('touchend', e => { if (x0 != null && x0 - e.changedTouches[0].clientX > 60) closeDrawer(); x0 = null; });
  }
  const d = ov.querySelector('.drawer');
  d.replaceChildren();
  const head = el('div', 'drawer-head');
  head.append(el('b', null, 'Nuvio'), el('span', 'muted', 'بيضل كل شي على جهازك'));
  d.append(head);
  const item = (icon, label, href, count) => {
    const a = el('a', 'drawer-item'); a.href = href;
    const ic = el('span', 'drawer-ico'); ic.innerHTML = window.ico ? window.ico(icon) : '';
    a.append(ic, el('span', null, label));
    if (count) a.append(el('span', 'drawer-count', nf.format(count)));
    a.onclick = () => closeDrawer();
    if (('#' + (location.hash.slice(1) || '/')) === href) a.classList.add('on');
    return a;
  };
  const sep = t => el('div', 'drawer-sep', t);
  d.append(
    item('home', 'الرئيسية', '#/'),
    item('subs', 'القنوات المشترك فيها', '#/subs', subs.list().length),
    item('clock', 'سجل المشاهدة', '#/history', lib.list('hist').length),
    item('like', 'الإعجابات', '#/likes', lib.list('likes').length),
    item('saved', 'المحفوظة', '#/favs', lib.list('favs').length),
    item('search', 'سجل البحث', '#/searches', store.get('searches', []).length),
  );
  if (store.get('ytlists', []).length) d.append(item('folder', 'قوائم التشغيل', '#/lists', store.get('ytlists', []).length));
  d.append(
    sep('Nuvio Music'),
    item('music', 'الرئيسية', '#/music'),
    item('star', 'المطربين المفضّلين', '#/music/fav', artists.list().length),
    item('phones', 'السجل السماعي', '#/music/hist', lib.list('mhist').length),
    item('mic', 'بودكاست', '#/music/podcast'),
  );
  if (!ov.classList.contains('open') && window.nuvioLockScroll) window.nuvioLockScroll(true);
  requestAnimationFrame(() => ov.classList.add('open'));
}
function closeDrawer() {
  const ov = document.querySelector('.drawer-ov');
  if (ov && ov.classList.contains('open')) { ov.classList.remove('open'); if (window.nuvioLockScroll) window.nuvioLockScroll(false); }
}

/* ================= ضغطة مطوّلة على اللوغو: Nuvio أو Nuvio Music ================= */
function openModePicker() {
  let ov = document.querySelector('.mode-ov');
  if (!ov) {
    ov = el('div', 'mode-ov');
    const box = el('div', 'mode-box');
    const opt = (cls, ico, title, sub, go) => {
      const b = el('button', 'mode-opt ' + cls);
      const i = el('span', 'mode-ico'); i.innerHTML = window.ico(ico);
      const t = el('span', 'mode-txt'); t.append(el('b', null, title), el('span', null, sub));
      b.append(i, t);
      b.onclick = () => { ov.classList.remove('open'); go(); };
      return b;
    };
    box.append(
      el('div', 'mode-title', 'شو بدّك تفتح؟'),
      opt('v', 'play', 'Nuvio', 'فيديوهات', () => { setMode('video', true); location.hash = '#/'; }),
      opt('m', 'music', 'Nuvio Music', 'أغاني ومطربين وبودكاست', () => { setMode('music', true); location.hash = '#/music'; }),
    );
    ov.append(box);
    ov.onclick = e => { if (e.target === ov) ov.classList.remove('open'); };
    document.body.append(ov);
  }
  requestAnimationFrame(() => ov.classList.add('open'));
  if (navigator.vibrate) navigator.vibrate(15);
}

document.addEventListener('DOMContentLoaded', () => {
  const name = document.querySelector('.brand-name');
  if (name) name.textContent = isMusic() ? 'NM' : 'N';
  document.body.classList.toggle('music-mode', isMusic());
  const menu = document.getElementById('menuBtn');
  if (menu) menu.onclick = openDrawer;
  const brand = document.querySelector('.brand');
  if (brand) {
    let t = null, long = false;
    const start = () => { long = false; clearTimeout(t); t = setTimeout(() => { long = true; openModePicker(); }, 480); };
    const stop = () => clearTimeout(t);
    brand.addEventListener('pointerdown', start);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => brand.addEventListener(ev, stop));
    brand.addEventListener('contextmenu', e => e.preventDefault());
    brand.addEventListener('click', e => {
      e.preventDefault();
      if (long) { long = false; return; }
      location.hash = isMusic() ? '#/music' : '#/';
    });
  }
});
