/* Nuvio — الحسابات: تسجيل/دخول بإيميل، مزامنة بياناتك مع سيرفرنا، عدّاد المتواجدين، ولوحة المدير.
   (بينحمّل قبل app.js: تعريفات بس، وaccInit() بينطلب من app.js وقت التشغيل) */
'use strict';

// (للتجربة عالجهاز بس: localhost بيقدر يحكي مع نسخة محلية بدل السيرفر الحقيقي)
const ACC = (location.hostname === 'localhost' && (() => { try { return localStorage.getItem('nuvio:accDev'); } catch { return ''; } })()) || 'https://tube.glanzstar.de/acc';
// شو بيتزامن مع حسابك (والباقي بيضل على الجهاز)
const ACC_KEYS = ['hist', 'likes', 'favs', 'mhist', 'subs', 'artists', 'ytlists', 'playlists', 'searches', 'later', 'pos', 'nope', 'nopeCh', 'chSeen', 'chTop', 'prefs'];
const accState = { applying: false, dirty: new Set(), timer: 0 };
const accToken = () => { try { return localStorage.getItem('nuvio:auth') || ''; } catch { return ''; } };
const accUser = () => store.get('me', null);

async function accApi(path, { method = 'GET', body, token = accToken(), keepalive = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(ACC + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, keepalive, cache: 'no-store' });
  let j = null; try { j = await r.json(); } catch { /* */ }
  if (!r.ok) throw Object.assign(new Error((j && j.error) || 'ما قدرت اتصل بالسيرفر'), { status: r.status });
  return j;
}

/* ---------- المزامنة ---------- */
function accApply(data, merge) {
  accState.applying = true;
  try {
    if (merge) mergeBackup({ app: 'nuvio', data }); // أول دخول: بيانات الضيف + الحساب سوا
    else for (const k of ACC_KEYS) if (data[k] != null) store.set(k, data[k]); // الحساب هو المرجع (بلا القيم الفاضية)
    if (data.prefs && data.prefs.theme) applyTheme(data.prefs.theme);
  } finally { accState.applying = false; }
}
function accPush(keys) {
  if (!accToken()) return Promise.resolve();
  const body = {};
  for (const k of keys) { const v = store.get(k, null); if (v != null) body[k] = v; } // ما منرفع قيم فاضية
  if (!Object.keys(body).length) return Promise.resolve();
  return accApi('/data', { method: 'PUT', body }).catch(() => { keys.forEach(k => accState.dirty.add(k)); });
}
function accFlush() {
  clearTimeout(accState.timer);
  if (!accState.dirty.size) return;
  const keys = [...accState.dirty]; accState.dirty.clear();
  accPush(keys);
}
window.addEventListener('nuvio:store', e => {
  if (accState.applying || !accToken() || !ACC_KEYS.includes(e.detail)) return;
  accState.dirty.add(e.detail);
  clearTimeout(accState.timer);
  accState.timer = setTimeout(accFlush, 2500);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) accFlush(); });

async function accLogin(kind, email, password, name) {
  const r = await accApi(kind === 'register' ? '/register' : '/login', { method: 'POST', body: { email, password, name, device: /Mobi|iPhone|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop' }, token: '' });
  localStorage.setItem('nuvio:auth', r.token);
  store.set('me', r.user);
  // بيانات الحساب + اللي كان عندك كضيف، وبعدين منرفع الكل
  try {
    const { data } = await accApi('/data');
    accApply(data || {}, true);
  } catch { /* */ }
  await accPush(ACC_KEYS);
  accPing();
  return r.user;
}
async function accLogout() {
  accFlush();
  try { await accApi('/logout', { method: 'POST' }); } catch { /* */ }
  // تسجيل الخروج = بياناتك بتنمسح من هالجهاز (بتضل محفوظة بحسابك)
  for (const k of ACC_KEYS) if (k !== 'prefs') localStorage.removeItem('nuvio:' + k);
  ['homeFeed', 'me', 'auth', 'chTopAt'].forEach(k => localStorage.removeItem('nuvio:' + k));
  location.hash = '#/';
  location.reload();
}

/* ---------- المتواجدين هلّق (نبضة كل 30 ثانية وإنت فاتح الموقع) ---------- */
function accDid() {
  let d = ''; try { d = localStorage.getItem('nuvio:did'); } catch { /* */ }
  if (!d) { d = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); try { localStorage.setItem('nuvio:did', d); } catch { /* */ } }
  return d;
}
function accPing() {
  if (document.hidden) return;
  const np = typeof active !== 'undefined' && active && active.np && active.np();
  const playing = !!(np && np.video && !np.video.paused) || !!(typeof shortsState !== 'undefined' && shortsState && shortsState.video && !shortsState.video.paused);
  accApi('/ping', { method: 'POST', body: { did: accDid(), page: (location.hash.slice(1) || '/').split('?')[0], playing, kind: matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop', v: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '', yt: !!(typeof prefs !== 'undefined' && prefs.get('player') === 'yt'), name: deviceName(), tv: isTvDev() }, keepalive: true }).catch(() => {});
}
async function accInit() {
  setInterval(accPing, 30e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) accPing(); });
  let navT = 0; // لمّا تنقل لصفحة تانية، اللوحة بتعرف وين صرت (مش أكتر من مرة كل 5 ثواني)
  window.addEventListener('hashchange', () => { clearTimeout(navT); navT = setTimeout(accPing, 5000); });
  setTimeout(accPing, 1500);
  if (!accToken()) return;
  try {
    const { user } = await accApi('/me');
    store.set('me', user);
    accCmdLoop();
    const { data } = await accApi('/data');
    if (data && Object.keys(data).length) accApply(data, false);
    if (typeof refreshLive === 'function') refreshLive();
  } catch (e) {
    if (e.status === 401) { localStorage.removeItem('nuvio:auth'); localStorage.removeItem('nuvio:me'); }
  }
}

/* ---------- صفحة الدخول / حساب جديد ---------- */
function renderLogin(mode = 'login') {
  document.title = 'تسجيل الدخول — Nuvio';
  if (accUser()) { location.hash = '#/me'; return; }
  const box = el('div', 'auth-page');
  const logo = el('div', 'auth-logo', 'N');
  const h = el('h1', null, mode === 'register' ? 'حساب جديد' : 'أهلا فيك');
  const sub = el('p', 'muted', 'سجلك وإعجاباتك واشتراكاتك وقوائمك بتنحفظ بحسابك، وبتلاقيها على أي جهاز.');
  const tabs = el('div', 'auth-tabs');
  [['login', 'دخول'], ['register', 'حساب جديد']].forEach(([k, label]) => {
    const b = el('button', k === mode ? 'on' : '', label);
    b.onclick = () => renderLogin(k);
    tabs.append(b);
  });
  const form = el('form', 'auth-form');
  const field = (type, ph, auto) => { const i = el('input', 'auth-input'); i.type = type; i.placeholder = ph; i.autocomplete = auto; i.required = true; return i; };
  const name = field('text', 'الاسم', 'name'); name.required = false;
  const email = field('email', 'الإيميل', 'email'); email.dir = 'ltr';
  const pass = field('password', 'كلمة السر (6 حروف عالأقل)', mode === 'register' ? 'new-password' : 'current-password'); pass.dir = 'ltr'; pass.minLength = 6;
  const err = el('div', 'auth-err');
  const go = el('button', 'btn btn-main auth-go', mode === 'register' ? 'اعمل حساب' : 'دخول');
  if (mode === 'register') form.append(name);
  form.append(email, pass, err, go);
  form.onsubmit = async e => {
    e.preventDefault();
    err.textContent = ''; go.disabled = true; go.textContent = '…';
    try {
      const u = await accLogin(mode, email.value.trim(), pass.value, name.value.trim());
      note(mode === 'register' ? `أهلا ${u.name} — انعمل حسابك ✓` : `أهلا ${u.name} ✓`);
      accCmdLoop();
      let after = ''; try { after = sessionStorage.getItem('nuvio:pairAfter') || ''; sessionStorage.removeItem('nuvio:pairAfter'); } catch { /* */ }
      location.hash = after ? '#/pair?c=' + after : '#/me';
    } catch (ex) {
      err.textContent = ex.message || 'صار خطأ';
      go.disabled = false; go.textContent = mode === 'register' ? 'اعمل حساب' : 'دخول';
    }
  };
  const fine = el('p', 'auth-fine muted', 'ما في رسالة تأكيد عالإيميل هلّق. كلمة السر بتنحفظ مشفّرة على سيرفرنا.');
  const qrBtn = el('button', 'btn auth-qr'); qrBtn.type = 'button';
  qrBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/></svg><span>دخول بكود QR من تلفونك</span>';
  qrBtn.onclick = showQrLogin;
  box.append(logo, h, sub, tabs, form, qrBtn, fine);
  view.replaceChildren(box);
  setTimeout(() => (mode === 'register' ? name : email).focus(), 100);
}
function confirmLogout() {
  openPrefSheet('تسجيل الخروج؟ سجلك وإعجاباتك وقوائمك بينمسحوا من هالجهاز، وبيضلّوا محفوظين بحسابك.', [
    { type: 'action', icon: 'upload', label: 'إيه، سجّل خروج', fn: accLogout },
  ]);
}

/* ---------- لوحة التحكّم (للمدير بس) ---------- */
const PAGE_AR = { '/devices': 'أجهزتي', '/pair': 'ربط جهاز', '/': 'الرئيسية', '/watch': 'عم يتفرّج على فيديو', '/shorts': 'شورتس', '/search': 'بحث', '/channel': 'قناة', '/subs': 'القنوات', '/me': 'صفحة أنا', '/settings': 'الإعدادات', '/admin': 'لوحة التحكّم', '/login': 'تسجيل الدخول', '/lib': 'مكتبتو', '/plist': 'قائمة تشغيل' };
const pageAr = p => PAGE_AR[p] || (p.startsWith('/music') ? 'Nuvio Music' : p);
function agoAr(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'هلّق';
  const m = Math.round(s / 60); if (m < 60) return `قبل ${nf.format(m)} د`;
  const h = Math.round(m / 60); if (h < 24) return `قبل ${nf.format(h)} س`;
  const d = Math.round(h / 24); return `قبل ${nf.format(d)} يوم`;
}
const fmtBytes = b => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b > 1e3 ? `${Math.round(b / 1e3)} KB` : `${b} B`);
function barsSvg(points, label) {
  const W = 600, H = 150, pad = 4, n = points.length, max = Math.max(1, ...points.map(p => p.n));
  const bw = (W - pad * 2) / n;
  const bars = points.map((p, i) => {
    const h = Math.max(p.n ? 3 : 1, (p.n / max) * (H - 26));
    return `<g><rect x="${(pad + i * bw + 2).toFixed(1)}" y="${(H - 18 - h).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${h.toFixed(1)}" rx="3" class="${p.n ? 'b' : 'b0'}"><title>${p.t}: ${p.n}</title></rect>${p.lab ? `<text x="${(pad + i * bw + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${p.lab}</text>` : ''}</g>`;
  }).join('');
  return `<svg class="adm-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${bars}</svg>`;
}
let admTimer = 0;
async function renderAdmin() {
  document.title = 'لوحة التحكّم — Nuvio';
  const me = accUser();
  if (!me || !me.admin) { view.replaceChildren(el('div', 'empty', 'هالصفحة للمدير بس.')); return; }
  const root = el('div', 'adm');
  const top = el('div', 'adm-top');
  top.append(el('h1', null, 'لوحة التحكّم'), el('span', 'adm-live', 'لايف · بتتحدّث كل 5 ثواني'));
  const body = el('div', 'adm-body'); body.append(el('div', 'empty', 'عم جيب الأرقام…'));
  root.append(top, body);
  view.replaceChildren(root);
  clearInterval(admTimer);
  const card = (label, value, sub, cls = '') => { const c = el('div', 'adm-card ' + cls); c.append(el('div', 'adm-v', value), el('div', 'adm-l', label)); if (sub) c.append(el('div', 'adm-s', sub)); return c; };
  const draw = async () => {
    if (!root.isConnected) { clearInterval(admTimer); return; }
    let s;
    try { s = await accApi('/admin/stats'); } catch (e) { body.replaceChildren(el('div', 'empty', e.message)); return; }
    const cards = el('div', 'adm-cards');
    cards.append(
      card('أونلاين هلّق', nf.format(s.online.total), `${nf.format(s.online.users)} مسجّلين · ${nf.format(s.online.guests)} ضيوف`, 'hot'),
      card('عم يتفرّجوا هلّق', nf.format(s.online.playing), `${nf.format(s.online.mobile)} عالتلفون`),
      card('المستخدمين المسجّلين', nf.format(s.totals.users), `${nf.format(s.totals.newUsers24h)} جداد اليوم · ${nf.format(s.totals.newUsers7d)} هالأسبوع`),
      card('كل الأجهزة', nf.format(s.totals.devices), 'مسجّلين + ضيوف'),
      card('نشطين آخر 24 ساعة', nf.format(s.totals.active24h), `${nf.format(s.totals.active7d)} آخر 7 أيام`),
      card('أوفلاين (مسجّلين)', nf.format(Math.max(0, s.totals.users - s.online.users)), 'مش فاتحين هلّق'),
    );
    const hrs = s.series.map((p, i) => { const d = new Date(p.h); return { n: p.n, t: d.toLocaleTimeString('ar', { hour: '2-digit' }), lab: i % 4 === 0 ? String(d.getHours()) : '' }; });
    const days = s.perDay.map(p => { const d = new Date(p.d); return { n: p.n, t: d.toLocaleDateString('ar'), lab: `${d.getDate()}/${d.getMonth() + 1}` }; });
    const charts = el('div', 'adm-charts');
    const c1 = el('div', 'adm-panel'); c1.append(el('h2', null, 'الأجهزة النشطة — آخر 24 ساعة')); c1.insertAdjacentHTML('beforeend', barsSvg(hrs, 'آخر 24 ساعة'));
    const c2 = el('div', 'adm-panel'); c2.append(el('h2', null, 'آخر 14 يوم')); c2.insertAdjacentHTML('beforeend', days.length ? barsSvg(days, 'آخر 14 يوم') : '<div class="muted">لسّا ما في أيام كفاية</div>');
    charts.append(c1, c2);
    // المتواجدين هلّق
    const onl = el('div', 'adm-panel');
    onl.append(el('h2', null, `المتواجدين هلّق (${nf.format(s.online.total)})`));
    if (!s.onlineList.length) onl.append(el('div', 'muted', 'ما في حدا فاتح هلّق.'));
    s.onlineList.forEach(x => {
      const r = el('div', 'adm-row');
      const av = el('span', 'adm-av' + (x.user ? '' : ' guest'), x.user ? x.user.charAt(0) : '؟');
      const tx = el('div', 'adm-tx');
      const nm = el('b', null, x.user || 'ضيف'); nm.dir = 'auto';
      tx.append(nm, el('span', 'muted', `${pageAr(x.page)} · ${x.kind === 'mobile' ? 'تلفون' : 'كمبيوتر'} · من ${agoAr(x.since).replace('قبل ', '')}${x.v ? ` · نسخة ${x.v}${typeof APP_VERSION !== 'undefined' && x.v === APP_VERSION ? ' ✓' : ' (قديمة)'}` : ' · نسخة قديمة'}${x.yt ? ' · مشغّل يوتيوب' : ''}`));
      r.append(av, tx);
      if (x.playing) r.append(el('span', 'adm-play', '▶ عم يشغّل'));
      onl.append(r);
    });
    // المستخدمين
    const us = el('div', 'adm-panel');
    us.append(el('h2', null, `المستخدمين (${nf.format(s.users.length)})`));
    const tbl = el('div', 'adm-users');
    s.users.forEach(u => {
      const r = el('div', 'adm-user');
      const dot = el('span', 'adm-dot' + (u.online ? ' on' : ''));
      const tx = el('div', 'adm-tx');
      const nm = el('b', null, (u.name || u.email) + (u.admin ? ' · مدير' : '')); nm.dir = 'auto';
      const em = el('span', 'muted', u.email); em.dir = 'ltr';
      tx.append(nm, em);
      const meta = el('div', 'adm-umeta');
      meta.append(
        el('span', null, u.online ? 'أونلاين هلّق' : `آخر ظهور ${agoAr(u.lastSeen || u.created)}`),
        el('span', null, `انضم ${new Date(u.created).toLocaleDateString('ar')}`),
        el('span', null, `سجل ${nf.format(u.hist || 0)} · إعجاب ${nf.format(u.likes || 0)} · قنوات ${nf.format(u.subs || 0)} · قوائم ${nf.format(u.playlists || 0)} · ${fmtBytes(u.bytes)}`),
      );
      r.append(dot, tx, meta);
      tbl.append(r);
    });
    us.append(tbl);
    const er = el('div', 'adm-panel');
    er.append(el('h2', null, `آخر الأخطاء عند المستخدمين (${nf.format((s.errors || []).length)})`));
    if (!(s.errors || []).length) er.append(el('div', 'muted', 'ما في أخطاء 👌'));
    (s.errors || []).forEach(x => {
      const r = el('div', 'adm-row');
      const tx = el('div', 'adm-tx');
      const m = el('b', null, x.m); m.dir = 'ltr';
      tx.append(m, el('span', 'muted', `${agoAr(x.at)} · ${x.dev}${x.standalone ? ' (أيقونة الشاشة)' : ''} · ${pageAr(x.p || '/')} · ${x.s}:${x.l} · نسخة ${x.v || '?'}`));
      r.append(el('span', 'adm-av guest', '!'), tx);
      er.append(r);
    });
    // جودة التشغيل عند المستخدمين (آخر 24 ساعة) + مصادر الفيديو عالسيرفر
    const qp = el('div', 'adm-panel');
    qp.append(el('h2', null, 'جودة التشغيل — آخر 24 ساعة'));
    const qa = (s.qoe && s.qoe.all) || null;
    if (!qa || !qa.sessions) qp.append(el('div', 'muted', 'لسّا ما في قياسات — بتبيّن أول ما حدا يتفرّج.'));
    else {
      const sec = ms => `${(ms / 1000).toFixed(1)} ث`;
      const qc = el('div', 'adm-cards');
      qc.append(
        card('وقفات بكل ساعة مشاهدة', qa.perHour == null ? '—' : nf.format(qa.perHour), `${nf.format(qa.stalls)} وقفة · ${nf.format(qa.stallSec)} ثانية انتظار`, qa.perHour > 2 ? 'hot' : ''),
        card('نسبة الانتظار', `${qa.stallPct}%`, 'من وقت المشاهدة'),
        card('لحتى يبلّش الفيديو', qa.startMed ? sec(qa.startMed) : '—', 'النص (median)'),
        card('القفز بالفيديو', qa.seekAvg ? sec(qa.seekAvg) : '—', `متوسّط · ${nf.format(qa.seekStuck || 0)} قفزة علقت`, qa.seekStuck ? 'hot' : ''),
        card('جلسات مشاهدة', nf.format(qa.sessions), `${nf.format(qa.watchedMin)} دقيقة · ${nf.format(qa.failed)} ما اشتغلت`),
      );
      qp.append(qc);
      const SRC_AR = { own: 'مصدرنا', comp: 'Companion', mp4: 'احتياط 360p', inv: 'سيرفر عام', piped: 'Piped', embed: 'مشغّل احتياطي', other: 'غيرو' };
      Object.entries(s.qoe.src || {}).sort((a, b) => b[1].sessions - a[1].sessions).forEach(([k, x]) => {
        const r = el('div', 'adm-row');
        const tx = el('div', 'adm-tx');
        tx.append(el('b', null, SRC_AR[k] || k), el('span', 'muted', `${nf.format(x.sessions)} جلسة · ${nf.format(x.watchedMin)} دقيقة · ${x.perHour == null ? '—' : nf.format(x.perHour)} وقفة/ساعة · بيبلّش ${x.startMed ? sec(x.startMed) : '—'} · ${nf.format(x.errs)} إعادة تحميل`));
        r.append(el('span', 'adm-av' + (k === 'own' ? '' : ' guest'), k === 'own' ? '✓' : '↺'), tx);
        qp.append(r);
      });
    }
    const svLine = el('div', 'muted'); svLine.style.marginTop = '10px'; qp.append(svLine);
    fetch('https://tube.glanzstar.de/sv/health', { cache: 'no-store' }).then(r => r.json()).then(h => {
      const x = h.sources || {};
      svLine.textContent = `السيرفر (من آخر تشغيل): قطع من «الكامل» ${nf.format(x.full || 0)} · IOS ${nf.format(x.ios || 0)} · Companion ${nf.format(x.comp || 0)}${h.compDown ? ' (واقف هلّق)' : ''} · انقطاع وكمّل ${nf.format(x.resumed || 0)} · ما جاوب ولا مصدر ${nf.format(x.none || 0)} · yt-dlp ${nf.format(x.ytdlpOk || 0)} ✓ / ${nf.format(x.ytdlpFail || 0)} ✗ (${((x.ytdlpMs || 0) / 1000).toFixed(1)} ث)`;
    }).catch(() => { svLine.textContent = 'السيرفر: ما قدرت اقرا حالتو'; });
    body.replaceChildren(cards, charts, qp, onl, us, er);
  };
  await draw();
  admTimer = setInterval(() => { if (!document.hidden) draw(); }, 5000);
}

/* ================= ربط الأجهزة: QR، بحث من التلفون، «شغّل على جهاز تاني» ================= */
const SITE = location.origin + location.pathname;
const libs = {};
function loadLib(url) {
  if (!libs[url]) libs[url] = new Promise((ok, bad) => { const s = document.createElement('script'); s.src = url; s.onload = ok; s.onerror = () => { delete libs[url]; bad(new Error('ما قدرت حمّل')); }; document.head.append(s); });
  return libs[url];
}
const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
const SCAN_LIB = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'; // (cdnjs ما عندو jsQR — كان 404)
const SCAN_LIB2 = 'https://unpkg.com/jsqr@1.4.0/dist/jsQR.min.js';
async function qrSvg(text) {
  await loadLib(QR_LIB);
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}
const isTvDev = () => typeof isTV === 'function' && isTV();
function deviceName() {
  const ua = navigator.userAgent;
  if (isTvDev() || /SmartTV|Tizen|Web0S|webOS|BRAVIA|AFT[A-Z]|GoogleTV|Android TV/i.test(ua)) return 'تلفزيون';
  const os = /iPhone/.test(ua) ? 'آيفون' : /iPad/.test(ua) ? 'آيباد' : /Android/.test(ua) ? 'أندرويد' : /Windows/.test(ua) ? 'كمبيوتر ويندوز' : /Mac/.test(ua) ? 'ماك' : /Linux/.test(ua) ? 'كمبيوتر لينكس' : 'جهاز';
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome/.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : '';
  return br ? `${os} · ${br}` : os;
}
// انتظار طويل عالسيرفر (بيرجع أول ما يصير شي، أو بعد 25 ثانية)
async function longGet(path, token) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 35000);
  try {
    const r = await fetch(ACC + path, { cache: 'no-store', signal: ctl.signal, headers: token ? { Authorization: 'Bearer ' + token } : {} });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error((j && j.error) || 'خطأ'), { status: r.status });
    return j;
  } finally { clearTimeout(tm); }
}

/* نافذة QR (للشاشة اللي بدها تتربط) */
function qrOverlay(title, hint) {
  const ov = el('div', 'qr-ov');
  const card = el('div', 'qr-card');
  const x = el('button', 'qr-x', '✕'); x.setAttribute('aria-label', 'سكّر');
  const h = el('h2', null, title);
  const box = el('div', 'qr-box'); box.append(el('div', 'qr-spin'));
  const code = el('div', 'qr-code');
  const p = el('p', 'muted', hint);
  const st = el('div', 'qr-status');
  card.append(x, h, box, code, p, st);
  ov.append(card);
  document.body.append(ov);
  const close = () => { ov.remove(); document.removeEventListener('keydown', esc, true); if (ov.onclose) ov.onclose(); };
  const esc = e => { if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 10009 || e.keyCode === 461) { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener('keydown', esc, true);
  x.onclick = close;
  ov.onclick = e => { if (e.target === ov) close(); };
  setTimeout(() => x.focus(), 50);
  return { ov, box, code, st, close };
}
async function pairNew(kind) {
  const r = await fetch(ACC + '/pair/new', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, dev: deviceName() }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'خطأ');
  return j;
}
async function fillQr(o, kind) {
  const p = await pairNew(kind);
  const url = `${SITE}#/pair?c=${p.code}`;
  o.box.innerHTML = await qrSvg(url);
  o.code.textContent = p.code.replace(/(.{4})/, '$1 ');
  return p;
}

/* ١) تسجيل دخول بـ QR: هالجهاز بيطلّع كود، وتلفونك (مسجّل دخول) بيمسحو */
async function showQrLogin() {
  const o = qrOverlay('سجّل دخول من تلفونك', 'امسح الكود بكاميرا تلفونك (أو من «أنا» ← «سجّل دخول جهاز تاني») ووافق.');
  let alive = true; o.ov.onclose = () => { alive = false; };
  while (alive) {
    let p;
    try { p = await fillQr(o, 'login'); } catch (e) { o.st.textContent = e.message || 'ما قدرت اتصل'; return; }
    const until = Date.now() + p.ttl - 5000;
    while (alive && Date.now() < until) {
      let r;
      try { r = await longGet(`/pair/wait?code=${p.code}&secret=${encodeURIComponent(p.secret)}`); } catch (e) { if (e.status === 404) break; await new Promise(z => setTimeout(z, 3000)); continue; }
      if (r && r.status === 'done') {
        localStorage.setItem('nuvio:auth', r.token);
        store.set('me', r.user);
        o.st.textContent = `أهلا ${r.user.name || ''} ✓`;
        try { const { data } = await accApi('/data'); accApply(data || {}, true); } catch { /* */ }
        await accPush(ACC_KEYS).catch(() => {});
        accPing(); accCmdLoop();
        setTimeout(() => { o.close(); note(`انسجّل الدخول ✓ أهلا ${r.user.name || ''}`); location.hash = '#/me'; route(); }, 700);
        return;
      }
    }
    if (alive) o.st.textContent = 'انتهى الكود — جبتلك واحد جديد';
  }
}

/* ٢) البحث من التلفون: الشاشة الكبيرة بتطلّع كود، والتلفون بيبعت الكلمات (كتابة أو صوت) */
let remoteSess = null;
async function openRemoteQr(onText) {
  const o = qrOverlay('ابحث من تلفونك', 'امسح الكود بكاميرا تلفونك، واكتب أو احكي شو بدك — بيبيّن هون فوراً.');
  remoteSess = remoteSess && Date.now() < remoteSess.until ? remoteSess : null;
  try {
    if (!remoteSess) { const p = await fillQr(o, 'remote'); remoteSess = { ...p, until: Date.now() + p.ttl - 5000, onText }; remoteLoop(remoteSess); }
    else { o.box.innerHTML = await qrSvg(`${SITE}#/pair?c=${remoteSess.code}`); o.code.textContent = remoteSess.code.replace(/(.{4})/, '$1 '); remoteSess.onText = onText; }
    remoteSess.overlay = o;
  } catch (e) { o.st.textContent = e.message || 'ما قدرت اتصل'; }
}
async function remoteLoop(s) {
  while (remoteSess === s) {
    let r;
    try { r = await longGet(`/pair/wait?code=${s.code}&secret=${encodeURIComponent(s.secret)}`); } catch (e) { if (e.status === 404) { if (remoteSess === s) remoteSess = null; return; } await new Promise(z => setTimeout(z, 3000)); continue; }
    if (r && r.status === 'msg') for (const m of r.msgs) {
      if (s.overlay && s.overlay.ov.isConnected) s.overlay.close();
      note(`📱 ${m.q}`);
      try { s.onText(m.q); } catch { /* */ }
    }
  }
}

/* صفحة الكود عالتلفون: #/pair?c=… */
async function renderPair(code) {
  document.title = 'ربط جهاز — Nuvio';
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const box = el('div', 'pair-page');
  box.append(el('div', 'auth-logo', 'N'));
  const msg = el('p', 'muted', 'عم شيّك الكود…');
  box.append(msg);
  view.replaceChildren(box);
  let info;
  try { info = await accApi('/pair/info?code=' + code, { token: '' }); } catch (e) { msg.textContent = e.message || 'الكود انتهى أو غلط'; return; }
  box.replaceChildren(el('div', 'auth-logo', 'N'));
  if (info.kind === 'remote') { // البحث من التلفون
    box.append(el('h1', null, 'ابحث عالشاشة'), el('p', 'muted', `اكتب أو احكي، وبيبيّن عـ«${info.dev || 'الشاشة'}» فوراً`));
    const f = el('form', 'remote-form');
    const inp = el('input', 'auth-input remote-in'); inp.type = 'search'; inp.placeholder = 'شو بدك تتفرّج؟'; inp.dir = 'auto'; inp.enterKeyHint = 'send';
    const mic = el('button', 'remote-mic'); mic.type = 'button'; mic.setAttribute('aria-label', 'احكي'); mic.innerHTML = window.ico ? window.ico('mic') : '🎤';
    const go = el('button', 'btn btn-main', 'ابعت');
    const sent = el('div', 'remote-sent');
    const sugs = el('div', 'remote-sugs');
    const row = el('div', 'remote-row'); row.append(inp, mic);
    f.append(row, sugs, go, sent);
    // اقتراحات فورية وإنت عم تكتب (من جوجل/يوتيوب) — كبسة عليها بتبعتها
    let sugT = 0, sugQ = '';
    inp.addEventListener('input', () => {
      clearTimeout(sugT);
      const q = inp.value.trim(); sugQ = q;
      if (!q) { sugs.replaceChildren(); return; }
      sugT = setTimeout(() => {
        if (typeof googleSuggest !== 'function') return;
        googleSuggest(q).then(list => {
          if (sugQ !== q) return;
          sugs.replaceChildren(...list.slice(0, 8).map(s => { const b = el('button', 'remote-sug', s); b.type = 'button'; b.dir = 'auto'; b.onclick = () => { sugs.replaceChildren(); send(s); }; return b; }));
        }).catch(() => {});
      }, 120);
    });
    const send = async q => {
      q = (q || '').trim(); if (!q) return;
      go.disabled = true;
      try { await accApi('/pair/send', { method: 'POST', body: { code, q }, token: '' }); sent.prepend(el('div', 'remote-item', `✓ ${q}`)); inp.value = ''; sugs.replaceChildren(); note('انبعت للشاشة ✓'); }
      catch (e) { note(e.message || 'ما انبعت'); }
      go.disabled = false;
    };
    f.onsubmit = e => { e.preventDefault(); send(inp.value); };
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) mic.onclick = () => { inp.focus(); note('اكبس على المايك بالكيبورد واحكي'); };
    else mic.onclick = () => {
      const r = new SR(); r.lang = /^en/i.test(navigator.language) ? 'en-US' : 'ar'; r.interimResults = true; r.maxAlternatives = 1;
      mic.classList.add('on');
      r.onresult = e => { const t = [...e.results].map(x => x[0].transcript).join(' '); inp.value = t; if (e.results[e.results.length - 1].isFinal) send(t); };
      r.onerror = () => { mic.classList.remove('on'); note('ما سمعت منيح — جرّب كمان مرة'); };
      r.onend = () => mic.classList.remove('on');
      try { r.start(); } catch { mic.classList.remove('on'); }
    };
    box.append(f);
    setTimeout(() => inp.focus(), 100);
  } else { // تسجيل دخول جهاز تاني
    box.append(el('h1', null, 'تسجيل دخول جهاز تاني'));
    const me = accUser();
    if (!me) {
      box.append(el('p', 'muted', `«${info.dev || 'جهاز'}» بدو يسجّل دخول بحسابك. سجّل دخول بهالمتصفح أول، وبعدين امسح الكود كمان مرة.`));
      try { sessionStorage.setItem('nuvio:pairAfter', code); } catch { /* */ }
      const a = el('a', 'btn btn-main', 'سجّل دخول'); a.href = '#/login'; box.append(a);
    } else if (info.used) {
      box.append(el('p', 'muted', 'هالكود انستعمل. اطلب كود جديد عالجهاز التاني.'));
    } else {
      box.append(el('p', null, `بدك تسجّل دخول بحسابك (${me.name || me.email}) على «${info.dev || 'جهاز'}»؟`));
      const ok = el('button', 'btn btn-main', 'إيه، سجّل دخول');
      const no = el('a', 'btn', 'لا'); no.href = '#/';
      ok.onclick = async () => {
        ok.disabled = true;
        try { await accApi('/pair/approve', { method: 'POST', body: { code } }); box.replaceChildren(el('div', 'auth-logo', '✓'), el('h1', null, 'تمام ✓'), el('p', 'muted', `«${info.dev || 'الجهاز'}» صار مسجّل دخول بحسابك.`)); }
        catch (e) { note(e.message || 'ما زبط'); ok.disabled = false; }
      };
      const acts = el('div', 'pair-acts'); acts.append(ok, no); box.append(acts);
    }
  }
}

/* مسح كود بالكاميرا (من «أنا») — أو كتابتو */
async function openScanner() {
  const o = qrOverlay('امسح الكود', 'وجّه الكاميرا عالكود اللي عالشاشة التانية');
  const vid = document.createElement('video'); vid.setAttribute('playsinline', ''); vid.muted = true; vid.className = 'qr-cam';
  o.box.replaceChildren(vid);
  o.code.remove();
  const manual = el('button', 'btn', 'اكتب الكود بإيدك'); o.st.replaceWith(manual);
  let stream = null, alive = true;
  o.ov.onclose = () => { alive = false; if (stream) stream.getTracks().forEach(t => t.stop()); };
  manual.onclick = () => { o.close(); askText('اكتب الكود اللي عالشاشة التانية', 'مثلاً ABCD 2345').then(v => { if (v) location.hash = '#/pair?c=' + encodeURIComponent(v.trim()); }); };
  const fail = m => { if (alive) o.box.replaceChildren(el('p', 'qr-err', m)); };
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return fail('هالمتصفح ما بيسمح بالكاميرا هون — اكتب الكود بإيدك');
  // الكاميرا أول (جوّا كبستك)، والقارئ بيتحمّل بنفس الوقت
  const libP = 'BarcodeDetector' in window ? Promise.resolve() : loadLib(SCAN_LIB);
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); }
  catch (e) { return fail(e && e.name === 'NotAllowedError' ? 'ما في إذن للكاميرا — اسمحلها من إعدادات المتصفح، أو اكتب الكود بإيدك' : 'ما قدرت افتح الكاميرا — اكتب الكود بإيدك'); }
  if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
  vid.setAttribute('autoplay', ''); vid.srcObject = stream;
  await vid.play().catch(() => {});
  let detect = null;
  if ('BarcodeDetector' in window) { try { const bd = new BarcodeDetector({ formats: ['qr_code'] }); detect = async () => { const r = await bd.detect(vid); return r && r[0] && r[0].rawValue; }; } catch { /* */ } }
  if (!detect) {
    try { await libP; } catch { /* */ }
    if (!window.jsQR) { try { await loadLib(SCAN_LIB2); } catch { /* */ } }
    if (!window.jsQR) return fail('ما قدرت حمّل قارئ الكود — اكتب الكود بإيدك');
    const cv = document.createElement('canvas'); const cx = cv.getContext('2d', { willReadFrequently: true });
    detect = async () => {
      const w = 480, h = Math.round(480 * vid.videoHeight / vid.videoWidth) || 360;
      cv.width = w; cv.height = h; cx.drawImage(vid, 0, 0, w, h);
      const r = jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
      return r && r.data;
    };
  }
  const tick = async () => {
    if (!alive) return;
    if (vid.readyState >= 2 && vid.videoWidth) {
      let text = null; try { text = await detect(); } catch { /* */ }
      const m = text && /[#?&]c=([A-Z0-9]{8})/i.exec(text);
      if (m) { o.close(); location.hash = '#/pair?c=' + m[1]; return; }
    }
    setTimeout(tick, 200);
  };
  tick();
}

/* ٣) «شغّل على جهاز تاني» */
async function openCastSheet(v) {
  if (!accToken()) { note('سجّل دخول بحسابك على الجهازين لحتى تشغّل من واحد عالتاني'); return; }
  let list = [];
  try { list = (await accApi('/devices')).devices.filter(d => d.did !== accDid()); } catch (e) { note(e.message || 'ما قدرت جيب أجهزتك'); return; }
  if (!list.length) { note('ما في جهاز تاني فاتح Nuvio بحسابك هلّق'); return; }
  const t = Math.floor(v.t || 0);
  openSheet(`شغّل «${(v.title || 'الفيديو').slice(0, 40)}» على:`, list.map(d => [d.tv || /تلفزيون/.test(d.name) ? 'subs' : d.kind === 'mobile' || /آيفون|أندرويد|آيباد|تلفون/.test(d.name) ? 'phones' : 'laptop',
    `${d.online ? '🟢' : '⚪'} ${d.name}${d.online ? (d.playing ? ' — عم يشغّل' : ' — أونلاين') : ' — مش متصل'}`,
    async () => {
      if (!d.online) { note('هالجهاز مش متصل هلّق'); return; }
      try {
        const r = await accApi('/cast', { method: 'POST', body: { did: d.did, id: v.id, t, title: v.title || '', from: deviceName() } });
        note(r.listening ? `انبعت لـ«${d.name}» ✓` : `انبعت — رح يبلّش أول ما «${d.name}» يكون فاتح`);
      } catch (e) { note(e.message || 'ما انبعت'); }
    }]));
}
// الأوامر الجاية لهالجهاز (انتظار طويل، بلا ما يسأل كل ثانية)
let cmdLoopOn = false;
async function accCmdLoop() {
  if (cmdLoopOn) return; cmdLoopOn = true;
  const mobile = matchMedia('(pointer: coarse)').matches && !isTvDev();
  while (accToken()) {
    if (mobile && document.hidden) { await new Promise(z => setTimeout(z, 3000)); continue; }
    try {
      const r = await longGet('/cmd?did=' + encodeURIComponent(accDid()), accToken());
      for (const c of (r && r.cmds) || []) if (c.type === 'play' && /^[\w-]{11}$/.test(c.id)) {
        note(`▶ انبعت من ${c.from || 'جهازك التاني'}`);
        location.hash = `#/watch?v=${c.id}${c.t ? `&t=${c.t}` : ''}`;
      }
    } catch (e) { if (e.status === 401) break; await new Promise(z => setTimeout(z, 5000)); }
  }
  cmdLoopOn = false;
}

/* «أجهزتي»: أجهزتك اللي فاتحة Nuvio بحسابك، وبتبعتلها فيديو (اللي عم يشتغل هلّق أو من سجلك) */
let devTimer = 0;
async function renderDevices() {
  document.title = 'أجهزتي — Nuvio';
  const box = el('div', 'devices-page');
  box.append(sectionHead('أجهزتي', null, 'laptop'));
  const me = accUser();
  if (!me) {
    box.append(el('p', 'muted', 'سجّل دخول بنفس الحساب على تلفونك وكمبيوترك وتلفزيونك، وبتشوفهن هون وبتبعتلهن فيديوهات.'));
    const a = el('a', 'btn btn-main', 'سجّل دخول'); a.href = '#/login';
    const q = el('button', 'btn', 'دخول بـ QR'); q.onclick = showQrLogin;
    const acts = el('div', 'pair-acts'); acts.append(a, q); box.append(acts);
    view.replaceChildren(box); return;
  }
  const list = el('div', 'dev-list'); list.append(el('div', 'muted', 'عم جيب أجهزتك…'));
  const add = el('button', 'btn dev-add', '+ سجّل دخول جهاز تاني'); add.onclick = openScanner;
  box.append(list, add, el('p', 'muted dev-hint', 'الأجهزة الخضر فاتحة Nuvio هلّق. لتبعت لتلفزيون أو كمبيوتر، افتح Nuvio عليه وسجّل دخول بنفس الحساب (أسهل شي بكود QR).'));
  view.replaceChildren(box);
  const draw = async () => {
    if (!list.isConnected) { clearInterval(devTimer); return; }
    let devs = [];
    try { devs = (await accApi('/devices')).devices; } catch (e) { list.replaceChildren(el('div', 'muted', e.message || 'ما قدرت جيب أجهزتك')); return; }
    const mine = accDid();
    if (!devs.some(d => d.did === mine)) devs.unshift({ did: mine, name: deviceName(), online: true, kind: matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop', page: '/devices' });
    list.replaceChildren(...devs.map(d => {
      const r = el('div', 'dev-row' + (d.online ? ' on' : ''));
      const ic = el('span', 'dev-ico'); ic.innerHTML = window.ico ? window.ico(d.tv || /تلفزيون/.test(d.name) ? 'subs' : d.kind === 'mobile' ? 'phones' : 'laptop') : '';
      const tx = el('div', 'dev-tx');
      tx.append(el('b', null, d.name + (d.did === mine ? ' (هالجهاز)' : '')),
        el('span', 'muted', d.online ? (d.playing ? 'عم يشغّل هلّق' : `أونلاين · ${pageAr(d.page || '/')}`) : `آخر مرة ${agoAr(d.at)}`));
      r.append(el('span', 'dev-dot'), ic, tx);
      if (d.did !== mine && d.online) {
        const b = el('button', 'btn btn-main dev-send', 'ابعتلو فيديو');
        b.onclick = () => sendToDevice(d);
        r.append(b);
      }
      return r;
    }));
  };
  await draw();
  clearInterval(devTimer); devTimer = setInterval(() => { if (!document.hidden) draw(); }, 8000);
}
// شو بدك تبعت: اللي عم يشتغل هلّق، أو من آخر اللي شفتو
function sendToDevice(d) {
  const items = [];
  const cur = typeof active !== 'undefined' && active && active.id ? active : null;
  const go = (id, title, t) => accApi('/cast', { method: 'POST', body: { did: d.did, id, t: Math.floor(t || 0), title, from: deviceName() } })
    .then(r => note(r.listening ? `انبعت لـ«${d.name}» ✓` : `انبعت — رح يبلّش أول ما «${d.name}» يكون فاتح`)).catch(e => note(e.message || 'ما انبعت'));
  if (cur) { const np = cur.np && cur.np(); items.push(['play', `اللي عم يشتغل: ${cur.title().slice(0, 40)}`, () => go(cur.id, cur.title(), np && np.video ? np.video.currentTime : 0)]); }
  lib.list('hist').filter(v => !cur || v.id !== cur.id).slice(0, 10).forEach(v => items.push(['clock', (v.title || v.id).slice(0, 60), () => go(v.id, v.title || '', 0)]));
  if (!items.length) { note('ما في فيديوهات بسجلك — افتح فيديو وابعتو من ⋮'); return; }
  openSheet(`ابعت لـ«${d.name}»:`, items);
}

/* ================= التعليقات تحت الفيديو =================
   ١) تعليقات Nuvio: بيكتبها اللي مسجّلين دخول عنا، وبتبيّن بس بموقعنا (عليها إشارة Nuvio).
   ٢) تعليقات يوتيوب: للقراءة بس. بتنجاب لمّا توصل لعندها (طلب صغير، وبتنحفظ عالجهاز)، والصور من جوجل مباشرة. */
function ytCmtParse(d) {
  const pay = new Map(walk(d, 'commentEntityPayload').map(p => [p.key, p]));
  const fromVm = vm => {
    const p = vm && pay.get(vm.commentKey); if (!p) return null;
    const pr = p.properties || {}, au = p.author || {}, tb = p.toolbar || {};
    return { text: (pr.content && pr.content.content) || '', time: pr.publishedTime || '', name: au.displayName || '', avatar: au.avatarThumbnailUrl || '', ch: au.channelId || '', verified: !!au.isVerified, creator: !!au.isCreator, likes: tb.likeCountNotliked || '', replies: String(tb.replyCount || '').trim() };
  };
  const items = []; let next = null, count = '';
  const hdr = walk(d, 'commentsHeaderRenderer')[0];
  if (hdr && hdr.countText) count = ((hdr.countText.runs || []).map(r => r.text).join('') || hdr.countText.simpleText || '').trim();
  const acts = walk(d, 'reloadContinuationItemsCommand').concat(walk(d, 'appendContinuationItemsAction'));
  for (const a of acts) for (const it of a.continuationItems || []) {
    if (it.commentThreadRenderer) {
      const t = it.commentThreadRenderer;
      const c = fromVm(t.commentViewModel && t.commentViewModel.commentViewModel);
      if (c) { const rc = walk(t.replies || {}, 'continuationCommand')[0]; c.repTok = rc ? rc.token : ''; items.push(c); }
    } else if (it.commentViewModel) {
      const c = fromVm(it.commentViewModel); if (c) items.push(c);
    } else if (it.continuationItemRenderer) {
      const cc = walk(it.continuationItemRenderer, 'continuationCommand')[0]; if (cc) next = cc.token;
    }
  }
  return { items, next, count };
}

function commentsSection(id) {
  const wrap = el('section', 'cmts');
  const head = el('button', 'cmts-h'); head.type = 'button';
  const hn = el('span', 'cmts-n', '');
  head.append(el('span', 'cmts-t', 'التعليقات'), hn, el('span', 'cmts-chev', '‹'));
  const body = el('div', 'cmts-body');
  const form = el('div', 'cmts-form');
  const ours = el('div', 'cmts-ours');
  const yt = el('div', 'cmts-yt');
  const st = el('div', 'cmts-st muted', '');
  const more = el('button', 'btn cmts-more', 'تعليقات أكتر'); more.hidden = true;
  const sent = el('div', 'cmts-sent');
  body.append(form, ours, yt, st, more, sent);
  wrap.append(head, body);
  // عالتلفون: مسكّرة (متل يوتيوب)، بتنفتح بكبسة. عالكمبيوتر: مفتوحة وبتنجاب لمّا تقرّب عليها
  const narrow = matchMedia('(max-width: 899px)').matches;
  if (narrow) wrap.classList.add('closed');
  let started = false, next = null, busy = false;
  head.onclick = () => { if (!narrow) return; const closed = wrap.classList.toggle('closed'); if (!closed) start(); };

  const seek = s => { const n = window.__nuvioNp; if (n && n.video) { n.video.currentTime = s; n.video.play().catch(() => {}); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
  const rich = (node, text) => { if (typeof renderRich === 'function') renderRich(node, text, seek); else node.textContent = text; };
  const letter = s => (String(s || '?').replace(/^@/, '').trim().charAt(0) || '?').toUpperCase();

  const ourCmt = c => {
    const d = el('div', 'cmt nuvio');
    const av = el('span', 'cmts-av nv', letter(c.name));
    const b = el('div', 'cmt-b');
    const h = el('div', 'cmt-h');
    const nm = el('span', 'cmt-name', c.name); nm.dir = 'auto';
    h.append(nm, el('span', 'cmt-badge', 'Nuvio'), el('span', 'cmt-time', agoAr(c.at)));
    const tx = el('div', 'cmt-text'); tx.dir = 'auto'; rich(tx, c.text);
    b.append(h, tx);
    if (c.canDel) {
      const ft = el('div', 'cmt-f');
      const del = el('button', 'cmt-del', 'احذف');
      del.onclick = () => openPrefSheet('تحذف هالتعليق؟', [{ type: 'action', icon: 'ban', label: 'إيه، احذفو', fn: async () => {
        try { await accApi('/comments?id=' + c.id, { method: 'DELETE' }); d.remove(); note('انحذف التعليق'); } catch (e) { note(e.message || 'ما قدرت احذفو'); }
      } }]);
      ft.append(del); b.append(ft);
    }
    d.append(av, b);
    return d;
  };

  const ytCmt = (c, reply) => {
    const d = el('div', 'cmt' + (reply ? ' reply' : ''));
    let av;
    if (c.avatar) {
      av = el('img', 'cmts-av'); av.alt = ''; av.loading = 'lazy'; av.decoding = 'async'; av.referrerPolicy = 'no-referrer'; av.src = c.avatar;
      av.onerror = () => av.replaceWith(el('span', 'cmts-av', letter(c.name)));
    } else av = el('span', 'cmts-av', letter(c.name));
    const b = el('div', 'cmt-b');
    const h = el('div', 'cmt-h');
    const nm = el(c.ch ? 'a' : 'span', 'cmt-name' + (c.creator ? ' creator' : ''), c.name); nm.dir = 'auto';
    if (c.ch) nm.href = chHref(c.ch);
    h.append(nm);
    if (c.verified) h.append(el('span', 'cmt-ok', '✓'));
    h.append(el('span', 'cmt-time', c.time));
    const tx = el('div', 'cmt-text'); tx.dir = 'auto'; rich(tx, c.text);
    const ft = el('div', 'cmt-f');
    if (c.likes && c.likes !== '0') ft.append(el('span', 'cmt-likes', '👍 ' + c.likes));
    b.append(h, tx, ft);
    if (!reply && c.repTok && c.replies && c.replies !== '0') {
      const rl = el('div', 'cmt-replies');
      const rb = el('button', 'cmt-rep', `${c.replies} ردّ ▾`);
      let repNext = c.repTok, loaded = false, rbusy = false;
      rb.onclick = async () => {
        if (loaded && !repNext) { rl.hidden = !rl.hidden; rb.textContent = rl.hidden ? `${c.replies} ردّ ▾` : 'خبّي الردود ▴'; return; }
        if (rbusy) return; rbusy = true; rb.textContent = 'عم جيب الردود…';
        try {
          const r = ytCmtParse(await yti('next', { continuation: repNext }, 8000));
          rl.append(...r.items.map(x => ytCmt(x, true)));
          repNext = r.next; loaded = true; rl.hidden = false;
          rb.textContent = repNext ? 'ردود أكتر ▾' : 'خبّي الردود ▴';
        } catch { rb.textContent = 'ما زبط — جرّب كمان مرة'; } finally { rbusy = false; }
      };
      ft.append(rb); b.append(rl);
    }
    d.append(av, b);
    return d;
  };

  const drawForm = () => {
    form.replaceChildren();
    const u = accUser();
    if (!u) {
      const a = el('a', 'cmts-login', 'سجّل دخول لتكتب تعليق بـ Nuvio');
      a.href = '#/login';
      form.append(a);
      return;
    }
    const row = el('div', 'cmts-frow');
    const ta = el('textarea', 'cmts-in'); ta.rows = 1; ta.maxLength = 1000; ta.placeholder = 'اكتب تعليق… (بيبيّن بـ Nuvio بس)'; ta.dir = 'auto';
    row.append(el('span', 'cmts-av nv', letter(u.name)), ta);
    const acts = el('div', 'cmts-facts');
    const cancel = el('button', 'btn cmts-cancel', 'إلغاء');
    const sendB = el('button', 'btn btn-main cmts-send', 'علّق'); sendB.disabled = true;
    acts.append(cancel, sendB); acts.hidden = true;
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(180, ta.scrollHeight) + 'px'; sendB.disabled = !ta.value.trim(); };
    ta.oninput = grow;
    ta.onfocus = () => { acts.hidden = false; };
    ta.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendB.click(); } };
    cancel.onclick = () => { ta.value = ''; grow(); acts.hidden = true; ta.blur(); };
    sendB.onclick = async () => {
      const text = ta.value.trim(); if (!text) return;
      sendB.disabled = true;
      try {
        const r = await accApi('/comments', { method: 'POST', body: { v: id, text } });
        ta.value = ''; grow(); acts.hidden = true; ta.blur();
        ours.prepend(ourCmt(r.comment));
        note('انضاف تعليقك ✓');
      } catch (e) { note(e.message || 'ما قدرت ضيف التعليق'); sendB.disabled = false; }
    };
    form.append(row, acts);
  };

  const loadOurs = async () => {
    try {
      const r = await accApi('/comments?v=' + encodeURIComponent(id));
      ours.replaceChildren(...(r.comments || []).map(ourCmt));
    } catch { /* سيرفر الحسابات مش متاح: تعليقات يوتيوب بتكفّي */ }
  };
  const loadYt = async () => {
    if (busy) return;
    busy = true; more.hidden = true;
    if (!yt.children.length) st.textContent = 'عم جيب التعليقات…';
    try {
      let tok = next;
      if (!tok) {
        const d = await ytNext(id);
        const sec = walk(d, 'itemSectionRenderer').filter(s => /comment/.test(s.sectionIdentifier || ''));
        const cc = walk(sec, 'continuationCommand')[0];
        if (!cc) { st.textContent = ours.children.length ? '' : 'التعليقات مسكّرة بهالفيديو'; return; }
        tok = cc.token;
      }
      const r = ytCmtParse(await yti('next', { continuation: tok }, 8000));
      if (r.count) { const n = parseInt(r.count.replace(/[^\d]/g, ''), 10); hn.textContent = n > 0 ? nf.format(n) : r.count; }
      yt.append(...r.items.map(c => ytCmt(c)));
      next = r.next;
      more.textContent = 'تعليقات أكتر'; more.hidden = !next;
      st.textContent = yt.children.length || ours.children.length ? '' : 'ما في تعليقات لهلّق';
    } catch {
      st.textContent = 'ما قدرت جيب تعليقات يوتيوب هلّق';
      more.textContent = 'جرّب كمان مرة'; more.hidden = false;
    } finally { busy = false; }
  };
  more.onclick = () => loadYt();
  const start = () => {
    if (started) return;
    started = true;
    drawForm(); loadOurs(); loadYt();
    // لمّا توصل لآخر التعليقات، بيجيب اللي بعدها لحالو
    const io2 = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && next && !busy && !wrap.classList.contains('closed') && wrap.isConnected) loadYt(); }, { rootMargin: '500px 0px' });
    io2.observe(sent);
  };
  if (!narrow) {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '700px 0px' });
    io.observe(wrap);
  }
  return wrap;
}
