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
  accApi('/ping', { method: 'POST', body: { did: accDid(), page: (location.hash.slice(1) || '/').split('?')[0], playing, kind: matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop' }, keepalive: true }).catch(() => {});
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
      location.hash = '#/me';
    } catch (ex) {
      err.textContent = ex.message || 'صار خطأ';
      go.disabled = false; go.textContent = mode === 'register' ? 'اعمل حساب' : 'دخول';
    }
  };
  const fine = el('p', 'auth-fine muted', 'ما في رسالة تأكيد عالإيميل هلّق. كلمة السر بتنحفظ مشفّرة على سيرفرنا.');
  box.append(logo, h, sub, tabs, form, fine);
  view.replaceChildren(box);
  setTimeout(() => (mode === 'register' ? name : email).focus(), 100);
}
function confirmLogout() {
  openPrefSheet('تسجيل الخروج؟ سجلك وإعجاباتك وقوائمك بينمسحوا من هالجهاز، وبيضلّوا محفوظين بحسابك.', [
    { type: 'action', icon: 'upload', label: 'إيه، سجّل خروج', fn: accLogout },
  ]);
}

/* ---------- لوحة التحكّم (للمدير بس) ---------- */
const PAGE_AR = { '/': 'الرئيسية', '/watch': 'عم يتفرّج على فيديو', '/shorts': 'شورتس', '/search': 'بحث', '/channel': 'قناة', '/subs': 'القنوات', '/me': 'صفحة أنا', '/settings': 'الإعدادات', '/admin': 'لوحة التحكّم', '/login': 'تسجيل الدخول', '/lib': 'مكتبتو', '/plist': 'قائمة تشغيل' };
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
      tx.append(nm, el('span', 'muted', `${pageAr(x.page)} · ${x.kind === 'mobile' ? 'تلفون' : 'كمبيوتر'} · من ${agoAr(x.since).replace('قبل ', '')}`));
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
        card('القفز بالفيديو', qa.seekAvg ? sec(qa.seekAvg) : '—', 'متوسّط'),
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
