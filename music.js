/* Nuvio Music + القائمة الجانبية + التبديل بين Nuvio و Nuvio Music.
   - ضغطة مطوّلة على اللوغو فوق: بتختار Nuvio (فيديوهات) أو Nuvio Music (أغاني).
   - القائمة الجانبية (☰): الاشتراكات، السجل، الإعجابات، المحفوظة، المطربين المفضّلين…
   - Nuvio Music: رئيسية بأقسام (الأكثر انتشاراً، جديد، عربي، خليجي، شامي…)، المطربين المفضّلين،
     السجل السماعي، وبودكاست. الأقسام بتتحمّل بس لمّا توصلها بالتمرير.
   (هالملف بيستعمل أدوات app.js وقت التشغيل.) */
'use strict';

/* ================= الوضع: فيديو أو ميوزك ================= */
const isMusic = () => { try { return JSON.parse(localStorage.getItem('nuvio:mode') || '"video"') === 'music'; } catch { return false; } };
function setMode(m) {
  try { localStorage.setItem('nuvio:mode', JSON.stringify(m)); } catch { /* */ }
  document.body.classList.toggle('music-mode', m === 'music');
  const name = document.querySelector('.brand-name');
  if (name) name.textContent = m === 'music' ? 'Nuvio Music' : 'Nuvio';
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
  note(on ? `⭐ ${a.name} صار بمطربينك المفضّلين` : `شلت ${a.name} من المفضّلين`);
}

/* ================= بحث موسيقي (مع ترتيب وتاريخ) ================= */
function musicSearch(q, o = {}) {
  const key = 'ms:' + q + JSON.stringify(o);
  return cached(key, 30 * 60e3, () => withFallback(i => {
    if (i.type !== 'invidious') return apiFor(i).search(i.url, q, 1).then(r => r.items);
    const extra = Object.entries(o).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
    return fetchJSON(`${i.url}/api/v1/search?q=${encodeURIComponent(q)}&type=video&page=1${extra}`)
      .then(d => (Array.isArray(d) ? d : []).filter(v => v.type === 'video').map(v => Invidious.item(i.url, v)));
  })).then(r => r.res);
}

const MUSIC_SHELVES = [
  { t: '🔥 الأكثر انتشاراً هالأسبوع', q: 'أغنية', o: { sort_by: 'view_count', date: 'week' } },
  { t: '🆕 أغاني جديدة', q: 'أغنية جديدة 2026', o: { date: 'month' } },
  { t: '🎶 عربي', q: 'أغاني عربية' },
  { t: '🌴 خليجي', q: 'أغاني خليجية' },
  { t: '🏔️ شامي', q: 'أغاني شامية' },
  { t: '🌙 مصري', q: 'أغاني مصرية' },
  { t: '🌍 عالمي', q: 'top hits official music video' },
  { t: '🎻 طرب أصيل', q: 'طرب أصيل' },
  { t: '☕ هادي', q: 'lofi chill music' },
];
const PODCAST_SHELVES = [
  { t: '🎙️ بودكاست عربي', q: 'بودكاست' },
  { t: '☕ فنجان', q: 'بودكاست فنجان' },
  { t: '💻 تقنية', q: 'بودكاست تقني' },
  { t: '🧠 تطوير الذات', q: 'بودكاست تطوير الذات' },
  { t: '🌍 English podcasts', q: 'podcast full episode' },
];
const TOP_ARTISTS = ['فيروز', 'أم كلثوم', 'عمرو دياب', 'نانسي عجرم', 'إليسا', 'محمد عبده', 'وائل كفوري', 'ماجد المهندس', 'أصالة', 'ناصيف زيتون', 'حسين الجسمي', 'تامر حسني', 'شيرين', 'راغب علامة'];

/* رف أفقي بيتحمّل بس لمّا توصلو بالتمرير */
function lazyShelf(title, loader, href) {
  const wrap = el('section', 'm-sec');
  wrap.append(sectionHead(title, href));
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

async function renderMusic(path) {
  setMode('music');
  document.title = 'Nuvio Music';
  if (path === '/music/hist') { renderLibrary('mhist'); view.prepend(musicTabs(path)); return; }
  view.replaceChildren(musicTabs(path));

  if (path === '/music/podcast') {
    PODCAST_SHELVES.forEach(s => view.append(lazyShelf(s.t, () => musicSearch(s.q, s.o))));
    return;
  }

  if (path === '/music/fav') {
    const list = artists.list();
    view.append(sectionHead(`المطربين المفضّلين (${list.length})`));
    if (!list.length) { view.append(el('div', 'empty', 'لسا ما ضفت مطربين. وقت تسمع أغنية اكبس ➕ بالمشغّل أو ⭐ من الزر العايم.')); }
    else {
      const grid = el('div', 'sub-grid');
      list.forEach(a => grid.append(channelBubble(a)));
      view.append(grid);
      list.slice(0, 12).forEach(a => view.append(lazyShelf(a.name, () => getChannel(a.id).then(r => r.res.items), chHref(a.id))));
    }
    return;
  }

  // الرئيسية: مطربينك (إذا في) + مطربين مشهورين + الأقسام
  const mine = artists.list();
  if (mine.length) {
    const row = el('div', 'sub-strip');
    mine.slice(0, 20).forEach(a => row.append(channelBubble(a)));
    view.append(sectionHead('مطربينك', '#/music/fav'), row);
    view.append(lazyShelf('⭐ من مطربينك', async () => {
      const res = await Promise.all(shuffle(mine).slice(0, 5).map(a => getChannel(a.id).then(r => r.res.items.slice(0, 4)).catch(() => [])));
      return shuffle(res.flat());
    }));
  }
  const top = el('div', 'sub-strip');
  view.append(sectionHead('🎤 مطربين'), top);
  (async () => {
    for (const name of TOP_ARTISTS) {
      try {
        const { res } = await cached('ma:' + name, 24 * 3600e3, () => withFallback(i => apiFor(i).channels(i.url, name)));
        const c = res && res[0];
        if (c && top.isConnected) top.append(channelBubble({ id: c.id, name: c.name, avatar: c.avatar }));
      } catch { /* */ }
    }
  })();
  MUSIC_SHELVES.forEach(s => view.append(lazyShelf(s.t, () => musicSearch(s.q, s.o))));
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
    d.addEventListener('touchend', e => { if (x0 != null && e.changedTouches[0].clientX - x0 > 60) closeDrawer(); x0 = null; });
  }
  const d = ov.querySelector('.drawer');
  d.replaceChildren();
  const head = el('div', 'drawer-head');
  head.append(el('b', null, 'Nuvio'), el('span', 'muted', 'بيضل كل شي على جهازك'));
  d.append(head);
  const item = (ico, label, href, count) => {
    const a = el('a', 'drawer-item'); a.href = href;
    a.append(el('span', 'drawer-ico', ico), el('span', null, label));
    if (count) a.append(el('span', 'drawer-count', nf.format(count)));
    a.onclick = () => closeDrawer();
    if (('#' + (location.hash.slice(1) || '/')) === href) a.classList.add('on');
    return a;
  };
  const sep = t => el('div', 'drawer-sep', t);
  d.append(
    item('🏠', 'الرئيسية', '#/'),
    item('📺', 'القنوات المشترك فيها', '#/subs', subs.list().length),
    item('🕘', 'سجل المشاهدة', '#/history', lib.list('hist').length),
    item('👍', 'الإعجابات', '#/likes', lib.list('likes').length),
    item('🔖', 'المحفوظة', '#/favs', lib.list('favs').length),
    item('🔎', 'سجل البحث', '#/searches', store.get('searches', []).length),
  );
  if (store.get('ytlists', []).length) d.append(item('📂', 'قوائم التشغيل', '#/lists', store.get('ytlists', []).length));
  d.append(
    sep('🎵 Nuvio Music'),
    item('🎵', 'الرئيسية', '#/music'),
    item('⭐', 'المطربين المفضّلين', '#/music/fav', artists.list().length),
    item('🎧', 'السجل السماعي', '#/music/hist', lib.list('mhist').length),
    item('🎙️', 'بودكاست', '#/music/podcast'),
  );
  requestAnimationFrame(() => ov.classList.add('open'));
}
function closeDrawer() { const ov = document.querySelector('.drawer-ov'); if (ov) ov.classList.remove('open'); }

/* ================= ضغطة مطوّلة على اللوغو: Nuvio أو Nuvio Music ================= */
function openModePicker() {
  let ov = document.querySelector('.mode-ov');
  if (!ov) {
    ov = el('div', 'mode-ov');
    const box = el('div', 'mode-box');
    const opt = (cls, ico, title, sub, go) => {
      const b = el('button', 'mode-opt ' + cls);
      const i = el('span', 'mode-ico', ico);
      const t = el('span', 'mode-txt'); t.append(el('b', null, title), el('span', null, sub));
      b.append(i, t);
      b.onclick = () => { ov.classList.remove('open'); go(); };
      return b;
    };
    box.append(
      el('div', 'mode-title', 'شو بدّك تفتح؟'),
      opt('v', '▶', 'Nuvio', 'فيديوهات', () => { setMode('video'); location.hash = '#/'; }),
      opt('m', '🎵', 'Nuvio Music', 'أغاني ومطربين وبودكاست', () => { setMode('music'); location.hash = '#/music'; }),
    );
    ov.append(box);
    ov.onclick = e => { if (e.target === ov) ov.classList.remove('open'); };
    document.body.append(ov);
  }
  requestAnimationFrame(() => ov.classList.add('open'));
  if (navigator.vibrate) navigator.vibrate(15);
}

document.addEventListener('DOMContentLoaded', () => {
  setMode(isMusic() ? 'music' : 'video');
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
