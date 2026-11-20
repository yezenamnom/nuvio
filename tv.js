/* Nuvio TV — وضع التلفزيون: واجهة كبيرة بتنقرا من بعيد، وتنقّل بأزرار الريموت (أسهم + OK + رجوع).
   بيشتغل لحالو لمّا تفتح الموقع من تلفزيون ذكي (سامسونغ، LG، أندرويد تي في، فاير تي في…)، أو بـ ?tv=1.
   مكتوب بجافاسكربت «قديمة شوي» لحتى يشتغل على متصفحات التلفزيونات. (بينحمّل قبل app.js) */
'use strict';

var TV_UA = /SmartTV|SMART-TV|Tizen|Web0S|webOS|NetCast|BRAVIA|AFT[A-Z]|CrKey|HbbTV|Android TV|GoogleTV|VIDAA|Opera TV|Roku|PhilipsTV|Hisense|TV Safari|PlayStation|Xbox/i;
function isTV() { return document.documentElement.classList.contains('tv'); }
function setTVMode(m) {
  prefs.set('tvMode', m);
  var on = m === 'on' || (m !== 'off' && TV_UA.test(navigator.userAgent));
  document.documentElement.classList.toggle('tv', on);
  location.reload();
}

/* ---------- الشريط الجانبي (يمين) ---------- */
var TV_RAIL = [
  ['#/tvsearch', 'search', 'بحث'],
  ['#/', 'home', 'الرئيسية'],
  ['#/subs', 'subs', 'القنوات'],
  ['#/music', 'music', 'موسيقى'],
  ['#/me', 'folder', 'مكتبتي'],
  ['#/settings', 'sun', 'الإعدادات'],
];
function tvBuildRail() {
  if (document.querySelector('.tv-rail')) return;
  var rail = el('nav', 'tv-rail');
  var logo = el('div', 'tv-logo', 'N');
  rail.append(logo);
  TV_RAIL.forEach(function (r) {
    var a = el('a', 'tv-ri'); a.href = r[0]; a.dataset.path = r[0].slice(1).split('?')[0] || '/';
    var ic = el('span', 'tv-ric'); ic.innerHTML = window.ico ? window.ico(r[1]) : '';
    a.append(ic, el('span', 'tv-rl', r[2]));
    rail.append(a);
  });
  document.body.append(rail);
}
function tvMarkRail() {
  var path = (location.hash.slice(1) || '/').split('?')[0];
  document.querySelectorAll('.tv-ri').forEach(function (a) {
    var p = a.dataset.path;
    a.classList.toggle('on', p === path || (p === '/music' && path.indexOf('/music') === 0) || (p === '/me' && ['/me', '/lib', '/history', '/likes', '/favs', '/later', '/plist'].indexOf(path) >= 0));
  });
}

/* ---------- التنقّل بالأسهم (spatial navigation) ---------- */
function tvVisible(x) {
  if (!x || x.disabled || x.offsetParent === null && getComputedStyle(x).position !== 'fixed') return false;
  var r = x.getBoundingClientRect();
  return r.width > 2 && r.height > 2;
}
function tvFocusables() {
  var sel = '.tv-rail a, #view a[href], #view button:not([disabled]), #view input, #view [tabindex="0"], .np-sheet-ov.open button';
  var sheet = document.querySelector('.np-sheet-ov.open');
  if (sheet) sel = '.np-sheet-ov.open button, .np-sheet-ov.open input';
  return Array.prototype.filter.call(document.querySelectorAll(sel), tvVisible);
}
function tvFocus(x) {
  if (!x) return;
  // علامة تركيز خاصة فينا (بعض متصفحات التلفزيون ما بترسم :focus منيح)
  var old = document.querySelectorAll('.tv-f'); for (var i = 0; i < old.length; i++) old[i].classList.remove('tv-f');
  x.classList.add('tv-f');
  x.focus({ preventScroll: true });
  if (x.dataset && x.dataset.vid && document.querySelector('.tv-hero')) tvHero(preview.get(x.dataset.vid)); // حتى لو المتصفح ما بعت حدث focus
  if (x.closest && x.closest('#view')) tvLast[location.hash] = x;
  var strip = x.closest('.tv-strip, .shelf, .sub-strip, .short-strip, .filter-bar, .chips, .related-list');
  try { x.scrollIntoView({ block: 'center', inline: strip ? 'center' : 'nearest', behavior: 'smooth' }); } catch (e) { x.scrollIntoView(); }
}
var tvRailLast = null;
function tvMove(dir) {
  var cur = document.activeElement;
  var list = tvFocusables();
  if (!cur || cur === document.body || list.indexOf(cur) < 0) { tvFocus(list.filter(function (x) { return !x.closest('.tv-rail'); })[0] || list[0]); return; }
  var R = function (x) { return x.getBoundingClientRect(); };
  var r = R(cur), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  var inRail = !!cur.closest('.tv-rail');
  var cands = list.filter(function (x) { return x !== cur; });
  var pick = function (arr, key) { var best = null, bs = Infinity; arr.forEach(function (x) { var s = key(x); if (s < bs) { bs = s; best = x; } }); return best; };
  if (dir === 'up' || dir === 'down') {
    // جوّا الشريط الجانبي: منضل فيه
    cands = cands.filter(function (x) { return !!x.closest('.tv-rail') === inRail; });
    var gap = function (x) { var b = R(x); return dir === 'down' ? b.top - r.bottom : r.top - b.bottom; };
    var ahead = cands.filter(function (x) { return gap(x) > -12; });
    if (!ahead.length) return;
    // أقرب صف، وبعدين الأقرب بالعرض جوّاتو
    var minGap = Math.min.apply(null, ahead.map(gap));
    var row = ahead.filter(function (x) { return gap(x) <= minGap + 30; });
    tvFocus(pick(row, function (x) { var b = R(x); return Math.abs(b.left + b.width / 2 - cx); }));
    return;
  }
  // يمين/شمال: بنفس الصف بس (ما منقفز لصف تاني)
  var same = cands.filter(function (x) {
    if (!!x.closest('.tv-rail') !== inRail) return false;
    var b = R(x), ov = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top);
    if (ov < Math.min(b.height, r.height) * 0.4) return false;
    return dir === 'right' ? b.left >= r.right - 12 : b.right <= r.left + 12;
  });
  if (same.length) { tvFocus(pick(same, function (x) { var b = R(x); return dir === 'right' ? b.left - r.right : r.left - b.right; })); return; }
  // آخر الصف من اليمين ← الشريط الجانبي؛ ومن الشريط لشمال ← رجعة للمحتوى
  if (dir === 'right' && !inRail) {
    var rail = cands.filter(function (x) { return x.closest('.tv-rail'); });
    tvRailLast = cur;
    tvFocus(rail.filter(function (x) { return x.classList.contains('on'); })[0] || pick(rail, function (x) { var b = R(x); return Math.abs(b.top + b.height / 2 - cy); }));
  } else if (dir === 'left' && inRail) {
    var back = tvRailLast && tvRailLast.isConnected && tvVisible(tvRailLast) ? tvRailLast : null;
    tvFocus(back || pick(cands.filter(function (x) { return !x.closest('.tv-rail'); }), function (x) { var b = R(x); return Math.abs(b.top + b.height / 2 - cy) + Math.abs(b.right - r.left) * 0.2; }));
  }
}
var tvBackKeys = { Escape: 1, GoBack: 1, BrowserBack: 1, XF86Back: 1 };
function tvIsBack(e) { return tvBackKeys[e.key] || e.keyCode === 10009 || e.keyCode === 461 || (e.key === 'Backspace' && !tvTyping()); }
function tvTyping() { var a = document.activeElement; return !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')); }

/* ---------- المشغّل بالريموت ---------- */
function tvPlayerKeys(e) {
  var np = typeof active !== 'undefined' && active && active.np && active.np();
  if (!np) return false;
  var more = document.body.classList.contains('tv-more');
  if (more) {
    if (e.key === 'ArrowUp') { e.preventDefault(); tvCloseMore(); return true; } // المشابه صف واحد: لفوق = رجعة للفيديو
    return false; // باقي الأسهم بتتنقّل بين الفيديوهات المشابهة
  }
  var k = e.key;
  if (k === 'Enter' || k === ' ' || k === 'MediaPlayPause' || e.keyCode === 10252 || e.keyCode === 415 || e.keyCode === 19) {
    e.preventDefault(); np.toggle(); np._showUI(); return true;
  }
  if (k === 'ArrowLeft' || k === 'MediaRewind' || e.keyCode === 412) { e.preventDefault(); np.skip(-10); np._showUI(); return true; }
  if (k === 'ArrowRight' || k === 'MediaFastForward' || e.keyCode === 417) { e.preventDefault(); np.skip(10); np._showUI(); return true; }
  if (k === 'ArrowUp') { e.preventDefault(); np._showUI(true); return true; }
  if (k === 'ArrowDown') { e.preventDefault(); tvOpenMore(); return true; }
  return false;
}
function tvOpenMore() {
  document.body.classList.add('tv-more');
  var first = document.querySelector('.related-list a.card');
  if (first) setTimeout(function () { tvFocus(first); }, 60);
}
function tvCloseMore() {
  document.body.classList.remove('tv-more');
  if (document.activeElement) document.activeElement.blur();
}

function tvKeydown(e) {
  if (!isTV()) return;
  var watching = document.body.classList.contains('watching');
  if (tvIsBack(e)) {
    if (tvTyping() && e.key === 'Backspace') return;
    e.preventDefault(); e.stopPropagation();
    if (document.querySelector('.np-sheet-ov.open')) { var ov = document.querySelector('.np-sheet-ov.open'); ov.click(); return; }
    if (watching && document.body.classList.contains('tv-more')) { tvCloseMore(); return; }
    if ((location.hash.slice(1) || '/') === '/') return; // الرئيسية: ما في رجوع
    history.back();
    return;
  }
  if (watching && tvPlayerKeys(e)) { e.stopPropagation(); return; }
  var dirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  var d = dirs[e.key];
  if (d) {
    if (tvTyping() && (d === 'left' || d === 'right')) return; // جوّا خانة الكتابة
    e.preventDefault(); e.stopPropagation();
    tvMove(d);
  }
}

/* ---------- الرئيسية بالتلفزيون: صورة كبيرة فوق + رفوف ---------- */
var tvHeroT = 0;
function tvHero(v) {
  var hero = document.querySelector('.tv-hero'); if (!hero || !v) return;
  clearTimeout(tvHeroT);
  tvHeroT = setTimeout(function () {
    var img = hero.querySelector('img');
    var src = 'https://i.ytimg.com/vi/' + v.id + '/maxresdefault.jpg';
    if (img.dataset.id !== v.id) {
      img.classList.remove('ok'); img.dataset.id = v.id;
      img.onerror = function () { if (img.src.indexOf('hqdefault') < 0) img.src = ytThumb(v.id, 'hqdefault'); };
      img.src = src;
    }
    hero.querySelector('.tv-ht').textContent = v.title || '';
    hero.querySelector('.tv-hm').textContent = [v.author, fmtViews(v.views, v.viewsText), v.published].filter(Boolean).join(' • ');
  }, 120);
}
function tvRow(rows, title, items) {
  if (!items || !items.length) return null;
  var sec = el('section', 'tv-row');
  sec.append(el('h2', null, title));
  var strip = el('div', 'tv-strip');
  items.forEach(function (v) {
    var c = card(v);
    c.classList.add('tv-card');
    c.addEventListener('focus', function () { tvHero(v); });
    strip.append(c);
  });
  sec.append(strip);
  rows.append(sec);
  return sec;
}
async function renderTVHome() {
  document.title = 'Nuvio TV';
  var hero = el('div', 'tv-hero');
  var img = el('img'); img.alt = '';
  var txt = el('div', 'tv-htx');
  txt.append(el('div', 'tv-ht', 'أهلا فيك بـ Nuvio'), el('div', 'tv-hm', 'استعمل الأسهم بالريموت، و OK لتشغّل'));
  hero.append(img, txt);
  var rows = el('div', 'tv-rows');
  view.replaceChildren(hero, rows);
  var focused = false;
  var focusFirst = function () {
    if (focused) return;
    var f = rows.querySelector('a.card'); if (!f) return;
    focused = true; tvFocus(f);
  };
  // ١) كمّل المشاهدة
  tvRow(rows, 'كمّل المشاهدة', lib.list('hist').filter(function (v) { var f = pos.frac(v.id); return !v.short && f > 0.03 && f < 0.95; }).slice(0, 20));
  focusFirst();
  // ٢) مقترح لك
  try {
    var saved = store.get('homeFeed', null), items = [];
    if (saved && saved.items && Date.now() - saved.at < 12 * 3600e3) items = saved.items;
    if (items.length < 12) { var feed = makeHomeFeed(new Set()); for (var i = 0; i < 3 && items.length < 24; i++) items = items.concat(await feed()); }
    tvRow(rows, 'مقترح لك', uniqById(items).filter(suggestOk).slice(0, 30));
    focusFirst();
  } catch (e) { /* */ }
  // ٣) من قنواتك
  var mine = subs.list().slice(0, 8);
  if (mine.length) {
    Promise.all(mine.map(function (c) { return getChannel(c.id).then(function (r) { return r.res.items.slice(0, 4); }).catch(function () { return []; }); }))
      .then(function (lists) {
        var all = [].concat.apply([], lists).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
        if (rows.isConnected) { tvRow(rows, 'جديد من قنواتك', all.slice(0, 24)); focusFirst(); }
      });
  }
  // ٤) موسيقى + رائج
  musicSearch('أغاني عربية جديدة', {}).then(function (list) { if (rows.isConnected) { tvRow(rows, 'موسيقى', list.slice(0, 20)); focusFirst(); } }).catch(function () {});
  musicSearch('وثائقي', {}).then(function (list) { if (rows.isConnected) { tvRow(rows, 'وثائقيات', list.slice(0, 20)); focusFirst(); } }).catch(function () {});
}

/* ---------- البحث بالتلفزيون ---------- */
function renderTVSearch() {
  document.title = 'بحث — Nuvio TV';
  var box = el('div', 'tv-search');
  var inp = el('input', 'tv-sinput'); inp.type = 'search'; inp.placeholder = 'شو بدك تتفرّج؟'; inp.dir = 'auto';
  var sug = el('div', 'tv-sug');
  var go = function (q) { q = (q || '').trim(); if (q) location.hash = '#/search?q=' + encodeURIComponent(q); };
  inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(inp.value); } });
  var draw = function (list, title) {
    sug.replaceChildren();
    if (title) sug.append(el('h2', null, title));
    var wrap = el('div', 'tv-sugs');
    list.slice(0, 12).forEach(function (s) { var b = el('button', 'tv-sb', s); b.dir = 'auto'; b.onclick = function () { go(s); }; wrap.append(b); });
    sug.append(wrap);
  };
  var t = 0;
  inp.addEventListener('input', function () {
    clearTimeout(t);
    var q = inp.value.trim();
    if (!q) { draw(store.get('searches', []), 'آخر بحوثك'); return; }
    t = setTimeout(function () { googleSuggest(q).then(function (l) { if (inp.value.trim() === q) draw(l); }).catch(function () {}); }, 200);
  });
  // ابحث من تلفونك: كود QR، بتكتب أو بتحكي عالتلفون وبيبحث هون
  var phone = el('button', 'tv-sb tv-phone', '📱 ابحث من تلفونك');
  phone.onclick = function () { openRemoteQr(function (q) { go(q); }); };
  var top = el('div', 'tv-srow'); top.append(inp, phone);
  box.append(top, sug);
  view.replaceChildren(box);
  draw(store.get('searches', []), store.get('searches', []).length ? 'آخر بحوثك' : '');
  setTimeout(function () { inp.focus(); }, 100);
}

/* لمّا ترجع لصفحة: التركيز بيرجع عالفيديو اللي كنت عليه */
var tvLast = {};
document.addEventListener('focusin', function (e) { if (isTV() && e.target.closest && e.target.closest('#view')) tvLast[location.hash] = e.target; });
function tvAfterRestore() {
  if (!isTV()) return;
  var x = tvLast[location.hash];
  setTimeout(function () { if (x && x.isConnected) tvFocus(x); else tvMove('down'); }, 50);
}

/* ---------- تشغيل ---------- */
function tvInit() {
  if (!isTV()) return;
  tvBuildRail();
  document.addEventListener('keydown', tvKeydown, true);
  window.addEventListener('hashchange', function () { tvMarkRail(); document.body.classList.remove('tv-more'); });
  tvMarkRail();
  // ماوس الريموت (LG): لمّا يتحرّك بيبيّن، وإلا التركيز بالأسهم
  document.addEventListener('mousemove', function () { document.documentElement.classList.add('tv-pointer'); clearTimeout(tvInit.mt); tvInit.mt = setTimeout(function () { document.documentElement.classList.remove('tv-pointer'); }, 3000); });
}
