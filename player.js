/* Nuvio Player — مشغّل خاص فينا فوق عنصر <video>.
   الترتيب متل المشغّلات المعروفة (شريط تقدّم تحت، أزرار تحتو، إعدادات، ملء الشاشة)،
   بس الشكل والأيقونات والخط تبعنا. وفيه مراقب بيكتشف إذا الفيديو علّق وبيطلب إعادة تحميل. */
'use strict';

(function () {
  const svg = (inner, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${inner}</svg>`;
  const ICON = {
    play: svg('<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/>'),
    pause: svg('<rect x="5.5" y="4" width="4.5" height="16" rx="1.4"/><rect x="14" y="4" width="4.5" height="16" rx="1.4"/>'),
    replay: svg('<path d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/>'),
    vol: svg('<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z"/><path class="s" d="M15.5 8.8a4.5 4.5 0 0 1 0 6.4M18.2 6.2a8.2 8.2 0 0 1 0 11.6"/>'),
    mute: svg('<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z"/><path class="s" d="M16 9.5l5 5M21 9.5l-5 5"/>'),
    gear: svg('<path class="s" d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle class="s" cx="15" cy="7" r="2.2"/><circle class="s" cx="9" cy="17" r="2.2"/>'),
    fs: svg('<path class="s" d="M4 9V4.8c0-.4.4-.8.8-.8H9M15 4h4.2c.4 0 .8.4.8.8V9M20 15v4.2c0 .4-.4.8-.8.8H15M9 20H4.8c-.4 0-.8-.4-.8-.8V15"/>'),
    theater: svg('<rect class="s" x="2.5" y="6" width="19" height="12" rx="1.8"/>'),
    fsx: svg('<path class="s" d="M9 4v4.2c0 .4-.4.8-.8.8H4M20 9h-4.2c-.4 0-.8-.4-.8-.8V4M15 20v-4.2c0-.4.4-.8.8-.8H20M4 15h4.2c.4 0 .8.4.8.8V20"/>'),
    copy: svg('<rect class="s" x="8.5" y="8.5" width="11" height="11" rx="2.2"/><path class="s" d="M15.5 8.5V6.2c0-1-.8-1.7-1.7-1.7H6.2c-1 0-1.7.8-1.7 1.7v7.6c0 1 .8 1.7 1.7 1.7h2.3"/>'),
    tv: svg('<path class="s" d="M3 17.5V6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M8 21l4-5 4 5z"/>'),
    plus: svg('<path class="s" d="M12 5v14M5 12h14"/>'),
    back: svg('<path d="M11 6.5v11L3 12zM20 6.5v11L12 12z"/>'),
    fwd: svg('<path d="M13 6.5v11l8-5.5zM4 6.5v11l8-5.5z"/>'),
    pip: svg('<rect class="s" x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11.5" width="7" height="5.5" rx="1"/>'),
  };
  // كمبيوتر (مش تلفون ولا آيباد): الفيديو بيضل شغّال بالخلفية، وفينا نطلّع شاشة عايمة
  const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const DESKTOP = !IOS && !/Android/i.test(navigator.userAgent) && matchMedia('(pointer: fine)').matches;
  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const fmt = s => {
    if (!isFinite(s) || s < 0) s = 0;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(Math.floor(s % 60)).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`;
  };
  const ls = {
    get(k, d) { try { const v = localStorage.getItem('nuvio:p:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('nuvio:p:' + k, JSON.stringify(v)); } catch { /* */ } },
  };
  // لغة الصوت لكل قناة لحالها: بالأساس الأصلي دايماً، وإذا غيّرت لقناة (مثلاً عربي لمستر بيست) كل فيديوهاتها بتصير هيك
  // app.js بيعطيها لـ Shaka قبل ما يبلّش الفيديو (فاضي = الأصلي)
  window.nuvioAudPref = ch => (ch && ls.get('audCh', {})[ch]) || '';
  try { localStorage.removeItem('nuvio:p:aud'); } catch { /* */ } // الخيار القديم (لكل الفيديوهات) انلغى
  // أسماء اللغات بالعربي (ar → العربية، en → الإنجليزية…)
  const AR_LANG = (() => { try { return new Intl.DisplayNames(['ar'], { type: 'language' }); } catch { return null; } })();
  const langName = l => { if (!l || l === 'und') return 'غير محدّد'; try { return (AR_LANG && AR_LANG.of(l)) || l; } catch { return l; } };
  /* قفل تمرير الصفحة (مع حفظ المكان) وقت تكون قائمة فوقها مفتوحة */
  let lockY = 0, locks = 0;
  function lockScroll(on) {
    const b = document.body;
    if (on) {
      if (locks++) return;
      lockY = window.scrollY;
      Object.assign(b.style, { position: 'fixed', top: `-${lockY}px`, left: '0', right: '0', overflow: 'hidden' });
    } else {
      if (!locks || --locks) return;
      Object.assign(b.style, { position: '', top: '', left: '', right: '', overflow: '' });
      window.scrollTo(0, lockY);
    }
  }
  window.nuvioLockScroll = lockScroll;
  const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  /* ================= فلتر الألوان (متل لوحة ألوان كرت الشاشة) =================
     سطوع، تباين، غاما، حيوية الألوان، درجة اللون — مع جاهزات. بينحفظ لكل الفيديوهات (وكمان الشورتس والمشغّل الصغير).
     «إيقاف» بيرجّع الصورة الأصلية بلا ما تضيع إعداداتك. بيشتغل على كرت الشاشة (خفيف عالجهاز). */
  const VF_DEF = { on: false, p: 'vivid', b: 100, c: 100, g: 1, s: 100, h: 0, k: 0 };
  const VF_PRESETS = [
    ['vivid', 'زاهي', { b: 103, c: 110, g: 1, s: 150, h: 0, k: 15 }],
    ['game', 'ألعاب', { b: 100, c: 115, g: 1.15, s: 180, h: 0, k: 30 }],
    ['cinema', 'سينما', { b: 97, c: 118, g: 0.95, s: 118, h: 0, k: 10 }],
    ['bright', 'فاتح', { b: 112, c: 105, g: 1.35, s: 115, h: 0, k: 0 }],
    ['soft', 'ناعم', { b: 97, c: 92, g: 1, s: 88, h: 0, k: 0 }],
    ['bw', 'أبيض وأسود', { b: 100, c: 118, g: 1, s: 0, h: 0, k: 10 }],
  ];
  const VF_KEYS = ['b', 'c', 'g', 's', 'h', 'k'];
  const VF_SLIDERS = [ // [مفتاح، اسم، أقل، أكتر، خطوة، كيف بينكتب]
    ['b', 'السطوع', 50, 150, 1, x => `${x}%`],
    ['c', 'التباين', 50, 200, 1, x => `${x}%`],
    ['g', 'غاما', 0.5, 2, 0.01, x => (+x).toFixed(2)],
    ['s', 'حيوية الألوان', 0, 300, 1, x => `${x}%`],
    ['h', 'درجة اللون', -180, 180, 1, x => `${x}°`],
    ['k', 'حدّة الصورة', 0, 100, 1, x => `${x}%`],
  ];
  // فلاتري: إعدادات حفظتها إنت باسم (بتطلع بالقائمة جنب الجاهزات)
  const vfMine = () => { const P = window.nuvioPref; const l = P && P.get('vfMine'); return Array.isArray(l) ? l.filter(x => x && x.id && x.name) : []; };
  const vfMineSet = l => { const P = window.nuvioPref; if (P) P.set('vfMine', l.slice(0, 20)); };
  const vfGet = () => { const P = window.nuvioPref; const v = P && P.get('vf'); return { ...VF_DEF, ...(v && typeof v === 'object' ? v : {}) }; };
  function vfApply(o = vfGet()) {
    const root = document.documentElement;
    if (!o.on) { ['--nv-vf', '--nv-vf-v', '--nv-gamma-a', '--nv-gamma-c'].forEach(k => root.style.removeProperty(k)); return; }
    const parts = [];
    // غاما: ما إلها فلتر CSS (وفلتر SVG المتصفح بيرفضو عالفيديو وبيلغي كل الفلتر معو). بدالها طبقة فوق الفيديو بخلط «soft-light»:
    // أبيض بيقرّب كل لون من جذرو التربيعي (= غاما 2)، وأسود من مربّعو (= غاما 0.5) — والشفافية بتحدّد قدّيش (مطابقة عالرمادي النص)
    const g = +o.g || 1;
    let ga = 0, gc = '#fff';
    if (g > 1.005) ga = (Math.pow(0.5, 1 / g) - 0.5) / (Math.SQRT1_2 - 0.5);
    else if (g < 0.995) { ga = (0.5 - Math.pow(0.5, 1 / g)) / 0.25; gc = '#000'; }
    ga = Math.max(0, Math.min(1, ga));
    if (ga > 0) { root.style.setProperty('--nv-gamma-a', ga.toFixed(3)); root.style.setProperty('--nv-gamma-c', gc); }
    else { root.style.removeProperty('--nv-gamma-a'); root.style.removeProperty('--nv-gamma-c'); }
    if (o.b !== 100) parts.push(`brightness(${o.b}%)`);
    if (o.c !== 100) parts.push(`contrast(${o.c}%)`);
    if (o.s !== 100) parts.push(`saturate(${o.s}%)`);
    if (o.h) parts.push(`hue-rotate(${o.h}deg)`);
    if (parts.length) root.style.setProperty('--nv-vf', parts.join(' ')); else root.style.removeProperty('--nv-vf');
    // حدّة الصورة: فلتر SVG (تقوية الحواف). بيشتغل بس على الفيديو تبعنا — المتصفح بيمنعو على مشغّل يوتيوب المضمّن (إطار من موقع تاني)،
    // فبينحط بمتغيّر لحالو (--nv-vf-v) لحتى ما يلغي الألوان هونيك
    const k = Math.max(0, Math.min(100, +o.k || 0));
    if (k > 0 && document.body) {
      let f = document.getElementById('nv-sharp');
      if (!f) {
        const NS = 'http://www.w3.org/2000/svg';
        const sv = document.createElementNS(NS, 'svg'); sv.setAttribute('width', '0'); sv.setAttribute('height', '0'); sv.setAttribute('aria-hidden', 'true'); sv.style.position = 'absolute';
        f = document.createElementNS(NS, 'filter'); f.id = 'nv-sharp'; f.setAttribute('color-interpolation-filters', 'sRGB');
        const cm = document.createElementNS(NS, 'feConvolveMatrix'); cm.setAttribute('order', '3'); cm.setAttribute('preserveAlpha', 'true'); cm.setAttribute('edgeMode', 'duplicate');
        f.append(cm); sv.append(f); document.body.append(sv);
      }
      const a = +(k / 100 * 0.8).toFixed(3); // ١٠٠٪ = تقوية قويّة بس بلا هالات بشعة
      f.firstChild.setAttribute('kernelMatrix', `0 ${-a} 0 ${-a} ${+(1 + 4 * a).toFixed(3)} ${-a} 0 ${-a} 0`);
      root.style.setProperty('--nv-vf-v', ['url(#nv-sharp)', ...parts].join(' '));
    } else if (parts.length) root.style.setProperty('--nv-vf-v', parts.join(' '));
    else root.style.removeProperty('--nv-vf-v');
  }
  function vfSet(o) { const P = window.nuvioPref; if (P) P.set('vf', o); vfApply(o); }
  window.nuvioVf = { get: vfGet, set: vfSet, apply: vfApply, presets: VF_PRESETS };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => vfApply()); else setTimeout(() => vfApply(), 0);

  class NuvioPlayer {
    constructor(box, opts = {}) {
      this.box = box; this.opts = opts; this.shaka = null; this.dead = false;
      box.classList.add('np'); box.dir = 'ltr'; box.tabIndex = 0;

      const v = this.video = opts.media || document.createElement('video'); // opts.media: مشغّل يوتيوب المضمّن (YtMedia)
      v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.autoplay = true;
      v.setAttribute('x-webkit-airplay', 'allow'); v.disableRemotePlayback = false;
      v.volume = ls.get('vol', 1); v.muted = ls.get('muted', false);
      this.rate = 1; // السرعة ما بتنحفظ: كل فيديو جديد بيبلّش عادي

      // ---- الواجهة ----
      this.ui = mk('div', 'np-ui');
      this.spinner = mk('div', 'np-spin');
      this.big = mk('button', 'np-big', ICON.play); this.big.setAttribute('aria-label', 'تشغيل');
      this.seekL = mk('div', 'np-ripple l', ICON.back + '<span>10</span>');
      this.seekR = mk('div', 'np-ripple r', ICON.fwd + '<span>10</span>');
      this.msgEl = mk('div', 'np-msg');
      this.speedEl = mk('div', 'np-speed', '<b>2×</b>' + ICON.fwd);

      const bottom = mk('div', 'np-bottom');
      this.bar = mk('div', 'np-bar');
      this.buf = mk('div', 'np-buf'); this.fill = mk('div', 'np-fill'); this.knob = mk('div', 'np-knob'); this.tip = mk('div', 'np-tip');
      this.low = mk('div', 'np-low'); // الطبقة الخفيفة (144p) — لوين وصل تحميل كل الفيديو
      this.tiersEl = mk('div', 'np-tiers'); // التحميل المتدرّج (720 / 480 / 360)
      this.sbEl = mk('div', 'np-sb'); // صورة صغيرة من الفيديو فوق الشريط (لمّا تمرّق أو تسحب)
      this.bar.append(this.low, this.tiersEl, this.buf, this.fill, this.knob, this.sbEl, this.tip);

      const row = mk('div', 'np-row');
      this.bPlay = mk('button', 'np-btn', ICON.play); this.bPlay.setAttribute('aria-label', 'تشغيل/إيقاف');
      this.bVol = mk('button', 'np-btn', v.muted ? ICON.mute : ICON.vol); this.bVol.setAttribute('aria-label', 'الصوت');
      this.vol = mk('input', 'np-vol'); Object.assign(this.vol, { type: 'range', min: 0, max: 1, step: 0.05, value: v.muted ? 0 : v.volume });
      this.time = mk('div', 'np-time', '0:00 / 0:00');
      this.chapEl = mk('button', 'np-chap'); this.chapEl.hidden = true; this.chapEl.dir = 'auto';
      this.chapEl.onclick = e => { e.stopPropagation(); this._menu('ch'); };
      this.segs = []; this.chapters = [];
      this.qBadge = mk('span', 'np-q');
      // بوضع الميوزك: زر ➕ (ضيف المطرب لمفضّلينك) بدل زر النسخ
      const plus = opts.copyIcon === 'plus';
      this.bCopy = mk('button', 'np-btn', plus ? ICON.plus : ICON.copy);
      this.bCopy.title = plus ? 'ضيف المطرب للمفضّلين' : 'نسخ الرابط'; this.bCopy.setAttribute('aria-label', this.bCopy.title);
      this.bGear = mk('button', 'np-btn', ICON.gear); this.bGear.setAttribute('aria-label', 'الإعدادات');
      this.bFs = mk('button', 'np-btn', ICON.fs); this.bFs.setAttribute('aria-label', 'ملء الشاشة');
      // وضع المسرح (كمبيوتر): الفيديو بعرض الصفحة
      this.bTheater = mk('button', 'np-btn np-theater', ICON.theater); this.bTheater.title = 'وضع المسرح (T)'; this.bTheater.setAttribute('aria-label', 'وضع المسرح');
      this.bTheater.hidden = !DESKTOP;
      this.bTheater.onclick = e => { e.stopPropagation(); if (window.nuvioTheater) window.nuvioTheater(); };
      const volWrap = mk('div', 'np-volwrap'); volWrap.append(this.bVol, this.vol);
      this.bCast = mk('button', 'np-btn', ICON.tv); this.bCast.title = 'عرض على شاشة'; this.bCast.setAttribute('aria-label', 'عرض على شاشة'); this.bCast.hidden = true;
      this.bCast.onclick = e => { e.stopPropagation(); this.cast(); };
      this.bPip = mk('button', 'np-btn', ICON.pip); this.bPip.title = 'شاشة عايمة'; this.bPip.setAttribute('aria-label', 'شاشة عايمة');
      this.bPip.hidden = !(DESKTOP && (this.canDocPip() || this.canPip()));
      this.bPip.onclick = e => { e.stopPropagation(); (this.canDocPip() ? this.docPip(false) : this.pip()).catch(() => {}); };
      row.append(this.bPlay, volWrap, this.time, this.chapEl, mk('div', 'np-space'), this.bCast, this.bCopy, this.qBadge, this.bPip, this.bGear, this.bTheater, this.bFs);
      bottom.append(this.bar, row);

      this.menu = mk('div', 'np-menu'); this.menu.dir = 'rtl'; this.menu.hidden = true;

      // إذا المتصفح منع الصوت بالتشغيل التلقائي (الفيديو الجاي مثلاً): منشغّل بلا صوت، وكبسة وحدة بترجّع الصوت
      this.unmuteEl = mk('button', 'np-unmute', ICON.mute + '<span>اكبس لتشغيل الصوت</span>'); this.unmuteEl.dir = 'rtl'; this.unmuteEl.hidden = true;
      this.unmuteEl.onclick = e => { e.stopPropagation(); this._unmute(); };
      ['pointerdown', 'pointerup'].forEach(n => this.unmuteEl.addEventListener(n, e => e.stopPropagation())); // الكبسة عالزر ما بتوقّف الفيديو
      this.ui.append(this.spinner, this.big, this.seekL, this.seekR, this.msgEl, this.speedEl, this.unmuteEl, bottom, this.menu);
      box.replaceChildren(opts.media ? opts.media.el : v, mk('div', 'np-gamma'), this.ui); // np-gamma: غاما فلتر الألوان (فوق الفيديو، تحت الأزرار)
      this._bind();
      this._showUI();
      this._watchdog();
      if (this.canAudioFx()) {
        this.video.addEventListener('playing', () => this.applyAudioFx(), { once: true });
        const fxTap = () => { if (this.dead) return document.removeEventListener('pointerdown', fxTap, true); const P = window.nuvioPref; if (P && (P.get('stableVol') || P.get('voiceBoost')) && !this._fx) this.applyAudioFx(); };
        document.addEventListener('pointerdown', fxTap, true);
      }
      // النافذة العايمة لسّا مفتوحة من الفيديو اللي قبل (القائمة/التشغيل التلقائي نقل لفيديو تاني وانت برّا)؟ منكمّل فيها
      const kw = DESKTOP && window.documentPictureInPicture && documentPictureInPicture.window;
      if (kw && kw.__nuvioKeep) { const k = kw.__nuvioKeep; setTimeout(() => { if (!this.dead && kw.__nuvioKeep === k && box.parentNode) this.docPip(k.auto, kw).catch(() => {}); }, 0); }
    }

    /* ---------- ربط مع Shaka (للجودة) ---------- */
    setShaka(sp) {
      this.shaka = sp;
      if (sp) {
        sp.addEventListener('adaptation', () => this._updQ());
        sp.addEventListener('trackschanged', () => this._updQ());
      }
      this.video.playbackRate = this.rate;
      this._updQ();
    }
    /* ---------- مستوى الصوت الثابت + تحسين الصوت (متل يوتيوب) ----------
       بمشغّلنا بس (<video>)، مش بمشغّل يوتيوب المضمّن. منمرّق الصوت من: تحسين الكلام ← ضاغط ← تعويض ← السمّاعة.
       ما منوصّل إلا لمّا المتصفح يسمح بالصوت (AudioContext شغّال)، لحتى ما يصير الفيديو بلا صوت أبداً. */
    canAudioFx() { return !this.opts.media && !!(window.AudioContext || window.webkitAudioContext) && this.video instanceof HTMLMediaElement; }
    async applyAudioFx() {
      if (!this.canAudioFx()) return;
      const P = window.nuvioPref; if (!P) return;
      const stable = !!P.get('stableVol'), voice = !!P.get('voiceBoost');
      if (!this._fx && !stable && !voice) return; // ما في شي مطلوب: بلا Web Audio أصلاً
      if (!this._fx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        const ctx = window.__nuvioAC || (window.__nuvioAC = new AC());
        try { if (ctx.state !== 'running') await ctx.resume(); } catch { /* */ }
        if (ctx.state !== 'running' || this.dead || this._fx) return; // المتصفح لسّا ما سمح: منجرّب مع أول كبسة
        let src; try { src = ctx.createMediaElementSource(this.video); } catch { return; }
        const lows = ctx.createBiquadFilter(); lows.type = 'lowshelf'; lows.frequency.value = 180;
        const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2400; pk.Q.value = 0.9;
        const comp = ctx.createDynamicsCompressor();
        const mk2 = ctx.createGain();
        src.connect(lows); lows.connect(pk); pk.connect(comp); comp.connect(mk2); mk2.connect(ctx.destination);
        this._fx = { ctx, src, lows, pk, comp, mk2 };
      }
      const f = this._fx, t = f.ctx.currentTime;
      f.pk.gain.setTargetAtTime(voice ? 7 : 0, t, 0.05); f.lows.gain.setTargetAtTime(voice ? -5 : 0, t, 0.05);
      if (stable) { f.comp.threshold.value = -32; f.comp.knee.value = 18; f.comp.ratio.value = 5; f.comp.attack.value = 0.008; f.comp.release.value = 0.3; f.mk2.gain.setTargetAtTime(1.7, t, 0.1); }
      else { f.comp.threshold.value = 0; f.comp.knee.value = 0; f.comp.ratio.value = 1; f.mk2.gain.setTargetAtTime(1, t, 0.1); }
    }
    /* قناة الفيديو (لحتى لغة الصوت تكون حسب اختيارك لهالقناة، وإلا الأصلي) */
    setChannel(ch) { if (!ch || ch === this.chId) return; this.chId = ch; this.applyAudioPref(); }
    applyAudioPref() {
      const sp = this.shaka; if (!sp || !sp.getAudioLanguagesAndRoles) return;
      try {
        const langs = sp.getAudioLanguagesAndRoles(); if (langs.length < 2) return;
        const want = window.nuvioAudPref ? window.nuvioAudPref(this.chId) : '';
        const target = (want && langs.find(l => l.language === want)) || langs.find(l => l.role === 'main');
        const act = sp.getVariantTracks().find(t => t.active) || {};
        if (!target || (act.language === target.language && (!target.role || (act.audioRoles || []).includes(target.role)))) return;
        sp.selectAudioLanguage(target.language, target.role || undefined);
      } catch { /* */ }
    }
    /* صور صغيرة فوق شريط التقدّم (storyboard من يوتيوب): «رابط|عرض#طول#عدد#أعمدة#صفوف#كل قدّيش#اسم#توقيع|…» */
    setStoryboard(spec, dur) {
      this.sb = null; this.box.classList.remove('has-sb');
      if (!spec || typeof spec !== 'string') return;
      const parts = spec.split('|'), base = parts[0];
      const levels = parts.slice(1).map(x => x.split('#')).filter(x => x.length >= 8);
      if (!levels.length) return;
      const L = levels.length - 1; // أوضح مستوى عندنا (الأكبر) — التلفونات شاشاتها كثيفة، والصغير بيطلع مغبّش
      const [w, h, count, cols, rows, interval, name, sigh] = levels[L];
      this.sb = { base, L, w: +w, h: +h, count: +count, cols: +cols, rows: +rows, interval: +interval, name, sigh, dur: +dur || 0 };
      this.box.classList.add('has-sb');
    }
    _sbShow(f) {
      const s = this.sb, el = this.sbEl; if (!s || !s.count || !el) return;
      const dur = this.video.duration || s.dur || 0; if (!dur) return;
      const t = f * dur;
      let idx = s.interval > 0 ? Math.floor((t * 1000) / s.interval) : Math.floor(f * s.count);
      idx = Math.max(0, Math.min(s.count - 1, idx));
      const per = s.cols * s.rows, page = Math.floor(idx / per), k = idx % per;
      const url = s.base.replace('$L', s.L).replace('$N', s.name.replace('$M', page)) + (s.sigh ? (s.base.includes('?') ? '&' : '?') + 'sigh=' + encodeURIComponent(s.sigh) : '');
      // الحجم حسب شكل الفيديو (العريض لحد 160×90، الطولي والمربّع لحد 120 طول)،
      // وما منكبّر الصورة أكتر من مرّة ونص من حجمها الأصلي — أكتر من هيك بتصير ممغوطة ومغبّشة
      const ar = s.w / s.h;
      let W = 160, H = W / ar;
      if (H > 120) { H = 120; W = H * ar; }
      if (W / s.w > 1.5) { W = s.w * 1.5; H = s.h * 1.5; }
      W = Math.round(W); H = Math.round(H);
      const sc = W / s.w;
      const bw = this.bar.clientWidth || 1, x = Math.max(W / 2, Math.min(bw - W / 2, f * bw));
      Object.assign(el.style, { width: W + 'px', height: H + 'px', left: x + 'px', backgroundImage: `url("${url}")`, backgroundSize: `${s.cols * s.w * sc}px ${s.rows * s.h * sc}px`, backgroundPosition: `-${(k % s.cols) * s.w * sc}px -${Math.floor(k / s.cols) * s.h * sc}px` });
    }
    /* نسبة الفيديو (عرض÷طول) من الفيديو نفسو أو من معلوماتو — بتحدّد طول المشغّل عالتلفون الواقف */
    setRatio(r) {
      if (this.dead || !(r > 0.3 && r < 4)) return;
      this.ratio = r;
      this.box.style.setProperty('--vr', r.toFixed(4));
      if (this._fakeFs) this._fitRot(); // طلع الفيديو طولي؟ ما منلفّو
    }
    setMarks(segs) { this.segs = segs || []; this._drawMarks(); }
    setChapters(ch) { this.chapters = ch || []; this._drawMarks(); this._chapLabel(true); }
    _chapAt(t) { let c = null; for (const x of this.chapters) { if (x.t <= t) c = x; else break; } return c; }
    _chapLabel(force) {
      if (!this.chapters.length) { this.chapEl.hidden = true; return; }
      const c = this._chapAt(this.video.currentTime || 0);
      if (!force && c === this._chapCur) return;
      this._chapCur = c;
      this.chapEl.hidden = !c || !c.title;
      this.chapEl.textContent = c && c.title ? `• ${c.title} ›` : '';
    }
    _drawMarks() {
      if (!this.marks) { this.marks = mk('div', 'np-marks'); this.bar.insertBefore(this.marks, this.fill); }
      const d = this.video.duration;
      this.marks.replaceChildren();
      if (!isFinite(d) || d <= 0) return;
      for (const s of this.segs) {
        const m = mk('i', 'np-seg');
        m.style.left = `${(s.start / d) * 100}%`;
        m.style.width = `${Math.max(0.4, ((s.end - s.start) / d) * 100)}%`;
        this.marks.append(m);
      }
      for (const c of this.chapters.slice(1)) { const g = mk('i', 'np-gap'); g.style.left = `${(c.t / d) * 100}%`; this.marks.append(g); }
    }
    setTiers(list) {
      this.tiersEl.replaceChildren(...(list || []).map(r => {
        const d = mk('i', 'np-tier q' + (r.h >= 720 ? 3 : r.h >= 480 ? 2 : 1));
        d.style.left = `${r.from * 100}%`; d.style.width = `${Math.max(0.3, (r.to - r.from) * 100)}%`;
        return d;
      }));
    }
    setLowLayer(f) { this.low.style.width = `${Math.max(0, Math.min(1, f || 0)) * 100}%`; }
    message(t) { this.msgEl.textContent = t || ''; this.msgEl.classList.toggle('on', !!t); }
    destroy() {
      if (this._pipWin) this._pipKeep(); // النافذة العايمة بتضل للفيديو الجاي (إذا ما إجا، بتسكّر لحالها)
      if (this._fx) { try { this._fx.src.disconnect(); this._fx.mk2.disconnect(); } catch { /* */ } this._fx = null; }
      this.dead = true; clearInterval(this._wd); clearTimeout(this._hideT); clearTimeout(this._apT);
      if (this.opts.media && this.opts.media.destroy) this.opts.media.destroy();
      if (this._fakeFs) this._setFakeFs(false);
      if (this._orient) { window.removeEventListener('orientationchange', this._orient); try { screen.orientation.removeEventListener('change', this._orient); } catch { /* */ } }
      document.removeEventListener('keydown', this._key); document.removeEventListener('fullscreenchange', this._fsc);
      document.removeEventListener('visibilitychange', this._vis);
      if (this._unlockAny) document.removeEventListener('pointerup', this._unlockAny, true);
      clearTimeout(this._preT);
      if (this.bg) { this.bg.pause(); this.bg.removeAttribute('src'); this.bg.load(); }
    }

    /* ---------- أدوات القائمة العايمة ---------- */
    setLoop(on) {
      this.loop = !!on;
      this.video.loop = this.loop;
      if (this.bg) this.bg.loop = this.loop;
    }
    /* تشغيل تلقائي (أول الفيديو، الفيديو الجاي، بعد إعادة تحميل):
       - الصفحة بالخلفية (شاشة مسكّرة): منكمّل بالصوت بس
       - المتصفح منع الصوت: منشغّل بلا صوت + زر «اكبس لتشغيل الصوت»
       - انقطع الطلب أو ما بلّش: منجرّب كمان مرة */
    autoplay() {
      const v = this.video;
      if (this.dead || this.userPaused) return;
      if (document.hidden && !DESKTOP && this.bg && this.bgUrl) { this._toBg(); return; }
      const p = v.play();
      if (p && p.catch) p.catch(e => {
        if (this.dead || this.userPaused) return;
        const name = (e && e.name) || '';
        if (name === 'NotAllowedError' && !v.muted) {
          this._autoMuted = true; v.muted = true;
          v.play().then(() => { this.unmuteEl.hidden = false; this._showUI(); }).catch(() => {});
          try { navigator.sendBeacon('https://tube.glanzstar.de/acc/err', JSON.stringify({ m: 'autoplay blocked → muted', s: 'player.js', l: 0, v: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '', ua: navigator.userAgent.slice(0, 180), p: '/watch' })); } catch { /* */ }
        } else if (name === 'AbortError') setTimeout(() => { if (!this.dead && v.paused && !v.ended && !this.userPaused) v.play().catch(() => {}); }, 400);
      });
      clearTimeout(this._apT);
      this._apT = setTimeout(() => { if (!this.dead && v.paused && !v.ended && !this.userPaused && !this.bgOn && v.readyState >= 2 && !document.hidden) v.play().catch(() => {}); }, 2500);
    }
    _unmute() {
      const v = this.video;
      this._autoMuted = false; this.unmuteEl.hidden = true;
      v.muted = false; if (v.volume === 0) v.volume = 0.5;
      if (v.paused && !this.userPaused) v.play().catch(() => {});
    }
    pauseAll() {
      this.userPaused = true;
      this.video.pause();
      if (this.bg) this.bg.pause();
    }
    canPip() {
      const v = this.video;
      return !!((document.pictureInPictureEnabled && v.requestPictureInPicture) || (v.webkitSupportsPresentationMode && v.webkitSupportsPresentationMode('picture-in-picture')));
    }
    async pip() {
      const v = this.video;
      if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return true; }
      if (document.pictureInPictureEnabled && v.requestPictureInPicture) { await v.requestPictureInPicture(); return true; }
      if (v.webkitSupportsPresentationMode && v.webkitSupportsPresentationMode('picture-in-picture')) {
        v.webkitSetPresentationMode(v.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
        return true;
      }
      return false;
    }
    /* ---------- نافذة عايمة فوق كل شي (حتى لو رحت لتبويب أو برنامج تاني) ----------
       كروم وإيدج (Document Picture-in-Picture): المشغّل كلّو بأزرارنا — وحتى مشغّل يوتيوب المضمّن — بينتقل لنافذة صغيرة
       بتقدر تحرّكها وتكبّرها وين ما بدك. غيرهن (فايرفوكس/سفاري): صورة داخل صورة العادية للفيديو بس. */
    canDocPip() { return !!(DESKTOP && window.documentPictureInPicture); }
    async docPip(auto, reuse) {
      const DP = window.documentPictureInPicture;
      if (!DP) return false;
      if (this._pipWin) { this._pipWin.pw.close(); return true; } // مفتوحة: الكبسة التانية بترجّعو
      let pw = reuse && !reuse.closed ? reuse : null;
      if (!pw) {
        if (DP.window) DP.window.close();
        const r = this.box.getBoundingClientRect();
        const w = Math.round(Math.min(Math.max(r.width || 480, 360), 720));
        pw = await DP.requestWindow({ width: w, height: Math.round(w * 9 / 16) });
        const d = pw.document;
        for (const ss of document.styleSheets) { // نفس التصميم بالنافذة
          try { const st = d.createElement('style'); st.textContent = [...ss.cssRules].map(x => x.cssText).join('\n'); d.head.append(st); }
          catch { if (ss.href) { const l = d.createElement('link'); l.rel = 'stylesheet'; l.href = ss.href; d.head.append(l); } }
        }
        for (const a of document.documentElement.attributes) if (a.name !== 'style') d.documentElement.setAttribute(a.name, a.value);
        d.body.classList.add('pip-body');
      }
      pw.__nuvioKeep = 0;
      pw.document.title = document.title;
      pw.document.body.replaceChildren();
      // مكان الفيديو بالصفحة: «الفيديو بالنافذة العايمة — رجّعو لهون»
      const ph = mk('div', 'pip-ph');
      const back = mk('button', 'pip-back', ICON.pip + '<span>الفيديو شغّال بالنافذة العايمة</span><b>رجّعو لهون</b>');
      back.onclick = e => { e.stopPropagation(); pw.close(); };
      ph.append(back);
      const box = this.box, playing = !this.video.paused;
      box.before(ph);
      box.classList.add('in-pip');
      pw.document.body.append(box);
      if (this.video.listenOn) this.video.listenOn(pw); // مشغّل يوتيوب المضمّن بيحكي مع النافذة اللي هو فيها
      if (box._ytResume) box._ytResume(); else if (playing) this.video.play().catch(() => {});
      // فتحت لحالها لمّا رحت لتبويب تاني؟ لمّا ترجع بترجع الفيديو مكانو
      const onVis = () => { if (document.visibilityState === 'visible' && this._pipWin && this._pipWin.auto) pw.close(); };
      document.addEventListener('visibilitychange', onVis);
      this._pipWin = { pw, ph, auto: !!auto, onVis };
      pw.addEventListener('pagehide', () => { if (this._pipWin && this._pipWin.pw === pw) this._pipHome(); }, { once: true });
      return true;
    }
    _pipHome(noResume) {
      const s = this._pipWin; if (!s) return;
      this._pipWin = null;
      document.removeEventListener('visibilitychange', s.onVis);
      const box = this.box, playing = !this.video.paused;
      box.classList.remove('in-pip');
      if (s.ph.parentNode) { s.ph.parentNode.insertBefore(box, s.ph); s.ph.remove(); }
      if (this.video.unlistenOn) this.video.unlistenOn(s.pw);
      if (!noResume && !this.dead) { if (box._ytResume) box._ytResume(); else if (playing) this.video.play().catch(() => {}); }
      if (!noResume && window.nuvioPipClosed) window.nuvioPipClosed(this);
    }
    _pipKeep() {
      const s = this._pipWin; if (!s) return;
      const pw = s.pw, k = { at: Date.now(), auto: s.auto };
      this._pipHome(true);
      pw.__nuvioKeep = k;
      setTimeout(() => { if (pw.__nuvioKeep === k && !pw.closed) pw.close(); }, 6000);
    }

    /* AirPlay على آيفون/ماك، أو Chromecast/عرض على شاشة بأندرويد وكروم */
    enableCast(on) { this.bCast.hidden = !on; }
    async cast() {
      const v = this.video;
      if (v.webkitShowPlaybackTargetPicker) { v.webkitShowPlaybackTargetPicker(); return true; }
      if (v.remote && v.remote.prompt) { await v.remote.prompt(); return true; }
      return false;
    }

    /* ---------- شاشة القفل ومركز التحكّم ---------- */
    setMeta(m) {
      this.meta = m;
      if (!('mediaSession' in navigator)) return;
      const ms = navigator.mediaSession;
      try {
        ms.metadata = new MediaMetadata({ title: m.title || '', artist: m.artist || '', album: 'Nuvio', artwork: m.art ? [{ src: m.art, sizes: '480x360', type: 'image/jpeg' }] : [] });
      } catch { /* */ }
      const cur = () => (this.bgOn ? this.bg : this.video);
      const set = (a, fn) => { try { ms.setActionHandler(a, fn); } catch { /* مش مدعوم */ } };
      set('play', () => { this.userPaused = false; cur().play().catch(() => {}); });
      set('pause', () => { this.userPaused = true; cur().pause(); });
      set('seekbackward', d => { const x = cur(); x.currentTime = Math.max(0, x.currentTime - (d.seekOffset || 10)); });
      set('seekforward', d => { const x = cur(); x.currentTime = x.currentTime + (d.seekOffset || 10); });
      set('seekto', d => { cur().currentTime = d.seekTime; });
      set('nexttrack', this.opts.onNext || null);
      // رحت لتبويب تاني والفيديو شغّال: النافذة العايمة بتطلع لحالها (إذا الخيار شغّال والمتصفح بيسمح)
      if (DESKTOP) set('enterpictureinpicture', async () => {
        const P = window.nuvioPref;
        if (this.dead || (P && P.get('autoPip') === false) || this._pipWin || document.pictureInPictureElement || this.video.paused) return;
        try { if (this.canDocPip()) await this.docPip(true); else await this.video.requestPictureInPicture(); } catch { /* المتصفح ما سمح */ }
      });
    }

    /* ---------- تشغيل بالخلفية ----------
       لمّا تطلع من الصفحة أو تسكّر الشاشة، الآيفون بيوقّف الفيديو. فمنحوّل لحالنا لملف الصوت
       من نفس الثانية، ولمّا ترجع منرجع للفيديو من وين وصل الصوت. */
    setBgAudio(url) {
      this.bgUrl = url;
      if (!this.bg) {
        this.bg = new Audio();
        this.bg.preload = 'auto';
        this.bg.setAttribute('playsinline', '');
        this.bg.addEventListener('ended', () => { this.bgOn = false; }); this.bg.loop = !!this.loop;
        this.box.dispatchEvent(new CustomEvent('npbg', { detail: this.bg }));
      }
      // منجهّز أول الصوت مسبقاً (بلا تشغيل)، لحتى لمّا تسكّر الشاشة ينتقل فوراً بلا سكتة
      if (!DESKTOP) { clearTimeout(this._preT); this._preT = setTimeout(() => this._preload(), 4000); }
      if (!this._unlockAny) {
        this._unlockAny = () => { this._unlock(); if (this.unlocked || this.dead) document.removeEventListener('pointerup', this._unlockAny, true); };
        document.addEventListener('pointerup', this._unlockAny, true);
      }
      if (!this._vis) {
        this._vis = () => {
          if (DESKTOP || document.pictureInPictureElement) return;
          if (document.hidden) { if (!this.video.paused && !this.video.ended) this._toBg(); }
          else this._fromBg();
        };
        document.addEventListener('visibilitychange', this._vis);
        this.video.addEventListener('pause', () => { if (!DESKTOP && !document.pictureInPictureElement && document.hidden && !this.userPaused && !this.bgOn) this._toBg(); });
      }
    }
    /* لازم نشغّل الصوت مرة وحدة جوّا كبسة منك، لحتى الآيفون يسمحلنا نشغّلو لاحقاً بالخلفية */
    _unlock() {
      // الآيفون بيسمح لعنصر صوت يشتغل لاحقاً إذا انطلب منو «شغّل» جوّا كبسة منك.
      // منطلب ومنوقّف بنفس اللحظة (وبلا ما يكون فيه ملف) — هيك ما بيطلع صوت وما بياخد الصوت من الفيديو
      if (this.unlocked || !this.bg) return;
      const bg = this.bg;
      if (bg.src && !bg.paused) return;
      this.unlocked = true;
      try { bg.muted = true; const p = bg.play(); if (p && p.catch) p.catch(() => {}); bg.pause(); } catch { /* */ }
      setTimeout(() => { try { if (!this.bgOn) bg.pause(); bg.muted = false; } catch { /* */ } }, 0);
      this._preload();
    }
    // منجهّز أول الصوت مسبقاً (بلا تشغيل) — بس بعد «الفتح»، لحتى ما يتعارض مع صوت الفيديو
    _preload() {
      const bg = this.bg;
      if (DESKTOP || this.dead || !bg || !this.bgUrl || !this.unlocked || bg.src === this.bgUrl || !bg.paused) return;
      bg.preload = 'metadata'; bg.src = this.bgUrl;
    }
    _toBg() {
      const v = this.video, bg = this.bg;
      if (this.bgOn || this.dead) return;
      if (!bg || !this.bgUrl) { v.play().catch(() => {}); return; } // بلا ملف صوت: منحاول نكمّل الفيديو نفسو
      if (bg.src !== this.bgUrl) bg.src = this.bgUrl;
      const t = v.currentTime;
      const go = () => { try { bg.currentTime = t; } catch { /* */ } };
      if (bg.readyState > 0) go(); else bg.addEventListener('loadedmetadata', go, { once: true });
      bg.playbackRate = v.playbackRate; bg.muted = false; bg.volume = v.muted ? 0 : v.volume;
      bg.play().then(() => { this.bgOn = true; if (!v.paused) v.pause(); }).catch(() => { v.play().catch(() => {}); });
    }
    _fromBg() {
      if (!this.bgOn) return;
      const v = this.video, bg = this.bg;
      this.bgOn = false;
      const t = bg.currentTime, wasPlaying = !bg.paused;
      bg.pause();
      try { v.currentTime = t; } catch { /* */ }
      if (wasPlaying) v.play().catch(() => {});
    }

    /* ---------- الأحداث ---------- */
    _bind() {
      const v = this.video, box = this.box;
      const sync = () => {
        const p = v.paused || v.ended;
        this.bPlay.innerHTML = v.ended ? ICON.replay : p ? ICON.play : ICON.pause;
        this.big.innerHTML = v.ended ? ICON.replay : p ? ICON.play : ICON.pause;
        box.classList.toggle('paused', p);
        if (p) this._showUI(true); else this._showUI();
      };
      ['play', 'pause', 'ended', 'playing'].forEach(e => v.addEventListener(e, sync));
      v.addEventListener('waiting', () => box.classList.add('loading'));
      ['playing', 'canplay', 'seeked', 'pause'].forEach(e => v.addEventListener(e, () => box.classList.remove('loading')));
      v.addEventListener('loadstart', () => box.classList.add('loading'));
      v.addEventListener('timeupdate', () => this._progress());
      v.addEventListener('progress', () => this._progress());
      v.addEventListener('durationchange', () => { this._progress(); if (this.segs.length || this.chapters.length) this._drawMarks(); });
      v.addEventListener('volumechange', () => {
        this.bVol.innerHTML = v.muted || v.volume === 0 ? ICON.mute : ICON.vol;
        this.vol.value = v.muted ? 0 : v.volume;
        if (this._autoMuted && !v.muted && this.opts.media) { this._autoMuted = false; this.unmuteEl.hidden = true; } // رجع الصوت (من زر الصوت مثلاً)
        if (!this._autoMuted && !this.opts.media) { ls.set('vol', v.volume); ls.set('muted', v.muted); } // بمشغّل يوتيوب ما منحفظ (حالتو مش دايماً منّا)
      });
      // نسبة الفيديو الحقيقية (عرض/طول): عالتلفون الواقف المربّع والطولي بيكبرو عالطول متل يوتيوب (style.css: --vr)
      const fitRatio = () => { if (!this.opts.media && v.videoWidth > 0 && v.videoHeight > 0) this.setRatio(v.videoWidth / v.videoHeight); };
      v.addEventListener('loadedmetadata', fitRatio); v.addEventListener('resize', fitRatio);
      // مشغّل يوتيوب عالآيفون بلّش لحالو بلا صوت (الصوت بدّو كبسة منك): نفس زر «اكبس لتشغيل الصوت»
      v.addEventListener('automuted', () => { if (this.dead) return; this._autoMuted = true; this.unmuteEl.hidden = false; this._showUI(); });
      v.addEventListener('error', () => this.opts.onError && this.opts.onError(v.currentTime));

      this.bPlay.onclick = () => this.toggle();
      this.big.onclick = e => { e.stopPropagation(); this.toggle(); this._showUI(); };
      this.bVol.onclick = () => { v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 0.5; };
      this.vol.oninput = () => { v.volume = +this.vol.value; v.muted = v.volume === 0; };
      this.bFs.onclick = () => this.fullscreen();
      this.bCopy.onclick = e => { e.stopPropagation(); this.opts.onCopy && this.opts.onCopy(); };
      this.bGear.onclick = e => { e.stopPropagation(); this._menu(); };

      // شريط التقدّم: سحب بالماوس أو بالإصبع
      const frac = e => Math.min(1, Math.max(0, this._along(e, this.bar)));
      let drag = false;
      // الوقت + صورة المعاينة فوق الإصبع/الماوس (من أول لمسة، مش بس لمّا يتحرّك)
      const peek = f => {
        const ct = this.chapters.length ? this._chapAt(f * (v.duration || 0)) : null;
        this.tip.textContent = fmt(f * (v.duration || 0)) + (ct && ct.title ? `  •  ${ct.title}` : ''); this.tip.style.left = `${f * 100}%`;
        this._sbShow(f);
      };
      // بالإصبع ومعنا صور معاينة: الفيديو بيقفز لمّا تشيل إصبعك (متل يوتيوب) — بلا قفزات ورا بعض بتعلّق الفيديو.
      // الخط والنقطة والوقت بيلحقو إصبعك. بالماوس (أو بلا صور) القفز مباشر متل قبل.
      let later = false;
      const dragTo = f => { if (later) { this._dragF = f; this._progress(); } else this._seekTo(f); };
      this.bar.addEventListener('pointerdown', e => {
        drag = true; later = e.pointerType !== 'mouse' && !!this.sb;
        try { this.bar.setPointerCapture(e.pointerId); } catch { /* */ }
        box.classList.add('drag'); this._showUI(true); // ماسك الشريط: الأزرار ما بتختفي
        const f = frac(e); peek(f); dragTo(f);
      });
      this.bar.addEventListener('pointermove', e => {
        const f = frac(e);
        peek(f);
        if (drag) dragTo(f);
      });
      const end = e => {
        if (!drag) return;
        drag = false;
        if (later && this._dragF != null && e.type === 'pointerup') this._seekTo(this._dragF);
        this._dragF = null; later = false;
        box.classList.remove('drag');
        this._progress(); this._showUI(); // بعد ما تترك: الأزرار بتضل شوي وبعدين بتختفي
      };
      this.bar.addEventListener('pointerup', end); this.bar.addEventListener('pointercancel', end);
      this.bar.addEventListener('lostpointercapture', end);

      // ضغطة مطوّلة على الفيديو = سرعة 2× (متل يوتيوب)، ولمّا تشيل إصبعك بترجع متل ما كانت
      let holdT = 0, hx = 0, hy = 0, heldAt = 0;
      this.held = false;
      const startHold = e => {
        if (e.button > 0 || e.target.closest('.np-bottom, .np-menu, .np-big')) return;
        hx = e.clientX; hy = e.clientY;
        clearTimeout(holdT);
        const P = window.nuvioPref;
        if (P && P.get('holdSpeed') === false) return;
        const rate = (P && +P.get('holdRate')) || 2;
        holdT = setTimeout(() => {
          if (this.dead || v.ended || !this.menu.hidden) return;
          this.held = true;
          this._holdRate = v.playbackRate; this._holdPaused = v.paused;
          v.playbackRate = rate;
          const b = this.speedEl.querySelector('b'); if (b) b.textContent = `${rate}×`;
          if (v.paused) v.play().catch(() => {});
          box.classList.add('fast'); this._hideUI();
          try { if (navigator.vibrate) navigator.vibrate(10); } catch { /* */ }
        }, 450);
      };
      const moveHold = e => { if (!this.held && (Math.abs(e.clientX - hx) > 12 || Math.abs(e.clientY - hy) > 12)) clearTimeout(holdT); };
      const endHold = () => {
        clearTimeout(holdT);
        if (!this.held) return;
        this.held = false; heldAt = Date.now();
        v.playbackRate = this._holdRate || this.rate || 1;
        if (this._holdPaused) v.pause();
        box.classList.remove('fast');
      };
      this.ui.addEventListener('pointerdown', startHold);
      this.ui.addEventListener('pointermove', moveHold);
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => this.ui.addEventListener(n, endHold));
      box.addEventListener('contextmenu', e => { if (e.target.closest('.np-ui')) e.preventDefault(); }); // بلا قائمة الضغطة المطوّلة

      // الضغط على الفيديو: كمبيوتر = تشغيل/إيقاف، موبايل = إظهار الأزرار، ضغطتين = تقديم/ترجيع 10 ثواني
      let lastTap = 0, tapT;
      this.ui.addEventListener('pointerup', e => {
        this._unlock();
        if (this._autoMuted && !e.target.closest('.np-bottom, .np-menu')) { this._unmute(); return; } // أول كبسة بترجّع الصوت بس
        if (box.classList.contains('in-mini')) return; // بالمشغّل الصغير الكبسة بترجّع الفيديو كبير، ما بتوقّفو
        if (Date.now() - heldAt < 80) return; // كانت ضغطة مطوّلة (تسريع)، مش كبسة
        if (e.target.closest('.np-bottom, .np-menu, .np-big')) return;
        if (!this.menu.hidden) { this.menu.hidden = true; return; }
        const touch = e.pointerType === 'touch';
        const now = Date.now();
        const x = this._along(e, box);
        if (now - lastTap < 300 && (x < 0.35 || x > 0.65)) {
          clearTimeout(tapT); lastTap = 0;
          this.skip(x < 0.35 ? -10 : 10);
          return;
        }
        lastTap = now;
        clearTimeout(tapT);
        tapT = setTimeout(() => {
          if (touch) { box.classList.contains('ui') && !v.paused ? this._hideUI() : this._showUI(); }
          else this.toggle();
        }, touch ? 250 : 200);
      });
      this.ui.addEventListener('dblclick', e => { if (!e.target.closest('.np-bottom, .np-menu')) this.fullscreen(); });
      box.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') this._showUI(); });
      box.addEventListener('mouseleave', () => { if (!v.paused) this._hideUI(); });

      // الكيبورد
      // اختصارات متل يوتيوب (اكبس ? لتشوفهن كلهن)
      this._key = e => {
        if (this.dead || !box.isConnected) return;
        if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return; // اختصارات المتصفح لإلو
        const k = e.key.toLowerCase();
        const rate = d => { const i = Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(SPEEDS.includes(v.playbackRate) ? v.playbackRate : 1) + d)); v.playbackRate = SPEEDS[i]; this.rate = SPEEDS[i]; this.flash(SPEEDS[i] === 1 ? 'عادي' : `${SPEEDS[i]}×`); };
        const frame = d => { if (!v.paused) return; v.currentTime = Math.max(0, v.currentTime + d / 30); };
        if (e.shiftKey && k === 'n') { e.preventDefault(); if (this.opts.onNext) this.opts.onNext(); return; } // الفيديو الجاي
        if (e.shiftKey && k === 'p') { e.preventDefault(); if (window.nuvioPrev) window.nuvioPrev(); return; } // اللي قبلو (بالقائمة)
        const map = {
          ' ': () => this.toggle(), k: () => this.toggle(), f: () => this.fullscreen(), m: () => { v.muted = !v.muted; this.flash(v.muted ? 'بلا صوت' : 'الصوت رجع'); },
          arrowleft: () => this.skip(-5), arrowright: () => this.skip(5), j: () => this.skip(-10), l: () => this.skip(10),
          arrowup: () => { v.volume = Math.min(1, v.volume + 0.1); v.muted = false; this.flash(`الصوت ${Math.round(v.volume * 100)}%`); },
          arrowdown: () => { v.volume = Math.max(0, v.volume - 0.1); this.flash(`الصوت ${Math.round(v.volume * 100)}%`); },
          home: () => { v.currentTime = 0; }, end: () => { if (isFinite(v.duration)) v.currentTime = Math.max(0, v.duration - 1); },
          '>': () => rate(1), '<': () => rate(-1), '.': () => frame(1), ',': () => frame(-1),
          c: () => this.toggleCaptions(),
          t: () => { if (window.nuvioTheater) window.nuvioTheater(); },
          i: () => { if (window.nuvioMiniKey) window.nuvioMiniKey(); },
          '?': () => this.keysHelp(),
        };
        if (/^[0-9]$/.test(k) && isFinite(v.duration)) { v.currentTime = v.duration * (+k / 10); this._showUI(); return; }
        if (map[k]) { e.preventDefault(); map[k](); this._showUI(); }
      };
      document.addEventListener('keydown', this._key);
      this._fsc = () => {
        if (this.markTransition) this.markTransition();
        const on = document.fullscreenElement === box;
        this.bFs.innerHTML = on ? ICON.fsx : ICON.fs;
        box.classList.toggle('fs', on);
        if (!on) { try { screen.orientation.unlock(); } catch { /* */ } }
      };
      document.addEventListener('fullscreenchange', this._fsc);

      // وقفة ما طلبتها (ملء الشاشة، تدوير التلفون، تكبير/تصغير المشغّل): منكمّل لحالنا
      this._transAt = 0; this._oddPause = 0;
      const resume = () => { if (!this.dead && v.isConnected && v.paused && !v.ended && !this.userPaused && !this.bgOn && !document.hidden) v.play().catch(() => {}); };
      v.addEventListener('pause', () => {
        if (this.userPaused || v.ended || this.bgOn || this.dead || document.hidden || this.held) return;
        this._oddPause = Date.now();
        if (Date.now() - this._transAt < 2500) setTimeout(resume, 60);
      });
      this.markTransition = () => { this._transAt = Date.now(); if (Date.now() - this._oddPause < 1500) setTimeout(resume, 60); };
      this._orient = () => this.markTransition();
      window.addEventListener('orientationchange', this._orient);
      try { screen.orientation.addEventListener('change', this._orient); } catch { /* */ }
      v.addEventListener('webkitbeginfullscreen', () => this.markTransition());
      v.addEventListener('webkitendfullscreen', () => { this.markTransition(); setTimeout(resume, 350); }); // آيفون بيوقّف لمّا تطلع من ملء الشاشة
    }

    /* رسالة صغيرة بنص الفيديو (الصوت، السرعة، الترجمة…) */
    flash(t) {
      if (!this.flashEl) { this.flashEl = mk('div', 'np-flash'); this.ui.append(this.flashEl); }
      this.flashEl.textContent = t; this.flashEl.classList.add('on');
      clearTimeout(this._flT); this._flT = setTimeout(() => this.flashEl && this.flashEl.classList.remove('on'), 900);
    }
    toggleCaptions() {
      if (this.opts.media && this.video.applyCc && window.nuvioPref) { // مشغّل يوتيوب المضمّن
        const PP = window.nuvioPref; PP.set('cc', !PP.get('cc')); this.video.applyCc(); this.flash(PP.get('cc') ? 'الترجمة شغّالة' : 'الترجمة مطفية'); return;
      }
      if (!this.captions || !this.captions.length) { this.flash('ما في ترجمة لهالفيديو'); return; }
      if (this.capSel) { this._pickCaption(null); this.flash('الترجمة مطفية'); return; }
      const c = this.captions.find(x => /^ar/.test(x.lang || '')) || this.captions[0];
      this._pickCaption(c); this.flash(`الترجمة: ${c.label}`);
    }
    keysHelp() {
      if (this._help) { this._help.remove(); this._help = null; return; }
      const h = mk('div', 'np-help'); h.dir = 'rtl';
      const rows = [['مسافة / K', 'تشغيل / إيقاف'], ['J / L', '10 ثواني لورا / لقدّام'], ['← / →', '5 ثواني'], ['↑ / ↓', 'الصوت'], ['M', 'بلا صوت'], ['F', 'ملء الشاشة'],
        ['T', 'وضع المسرح'], ['I', 'المشغّل الصغير'], ['C', 'الترجمة'], ['Shift+N / Shift+P', 'الجاي / اللي قبل'], ['< / >', 'أبطأ / أسرع'], [', / .', 'صورة صورة (وهو موقّف)'], ['0 … 9', 'روح لـ 0%…90%'], ['Home / End', 'البداية / الآخر']];
      h.append(mk('div', 'np-help-t', 'اختصارات الكيبورد'));
      for (const [a, b] of rows) { const r = mk('div', 'np-help-r'); const kb = mk('b'); kb.textContent = a; const tx = mk('span'); tx.textContent = b; r.append(tx, kb); h.append(r); }
      h.onclick = e => { e.stopPropagation(); h.remove(); this._help = null; };
      ['pointerdown', 'pointerup'].forEach(n => h.addEventListener(n, e => e.stopPropagation()));
      this.box.append(h); this._help = h;
    }
    toggle() {
      const v = this.video;
      this._unlock();
      if (v.paused || v.ended) { this.userPaused = false; v.play().catch(() => {}); }
      else { this.userPaused = true; v.pause(); }
    }
    skip(s) {
      const v = this.video;
      v.currentTime = Math.max(0, Math.min((v.duration || 0) - 0.2, v.currentTime + s));
      const r = s < 0 ? this.seekL : this.seekR;
      r.classList.remove('on'); void r.offsetWidth; r.classList.add('on');
      this._showUI();
    }
    _seekTo(f) { const v = this.video; if (isFinite(v.duration)) { v.currentTime = f * v.duration; this._progress(); } }
    async fullscreen() {
      const v = this.video, box = this.box;
      this.markTransition();
      if (this._fakeFs) { this._setFakeFs(false); return; }
      if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
      if (box.requestFullscreen && document.fullscreenEnabled !== false) { // الآيفون ما بيسمح فيها: لا تضيّع الكبسة عليها
        try {
          await box.requestFullscreen({ navigationUI: 'hide' });
          if (v.videoWidth > v.videoHeight) { try { await screen.orientation.lock('landscape'); } catch { /* */ } }
          return;
        } catch { /* جرّب طريقة الآيفون */ }
      }
      if (v.webkitEnterFullscreen) { v.webkitEnterFullscreen(); return; } // آيفون: ملء الشاشة تبع النظام
      this._setFakeFs(true); // آيفون مع مشغّل يوتيوب: المشغّل بيغطّي كل الشاشة (لفّ التلفون بالعرض)
    }
    _setFakeFs(on) {
      if (!!this._fakeFs === !!on) return;
      this._fakeFs = !!on;
      this.box.classList.toggle('fakefs', this._fakeFs);
      document.documentElement.classList.toggle('np-fakefs', this._fakeFs);
      this.bFs.innerHTML = this._fakeFs ? ICON.fsx : ICON.fs;
      lockScroll(this._fakeFs);
      // التلفون واقف (أو قفل التدوير شغّال) والفيديو عريض: المشغّل بينلفّ بالعرض متل يوتيوب، ولمّا تلفّ التلفون بيرجع عادي
      if (!this._rotFit) this._rotFit = () => this._fitRot();
      ['resize', 'orientationchange'].forEach(n => (this._fakeFs ? window.addEventListener : window.removeEventListener).call(window, n, this._rotFit));
      this._fitRot();
      this._showUI();
    }
    _fitRot() {
      const rot = !!this._fakeFs && innerHeight > innerWidth && !(this.ratio && this.ratio < 1.05);
      if (rot === !!this._rot) return;
      this._rot = rot;
      this.box.classList.toggle('np-rot', rot);
    }
    /* وين الإصبع على طول العنصر (0 = أولو، 1 = آخرو) — والمشغّل ملفوف بالعرض: الطول عالشاشة صار من فوق لتحت */
    _along(e, el) {
      const r = el.getBoundingClientRect();
      return this._rot ? (e.clientY - r.top) / (r.height || 1) : (e.clientX - r.left) / (r.width || 1);
    }

    _progress() {
      const v = this.video, d = v.duration;
      if (!isFinite(d) || d <= 0) { this.time.textContent = `${fmt(v.currentTime)}`; return; }
      if (this._dragF != null) { // عم تسحب بإصبعك: الخط والوقت محل إصبعك (الفيديو بيقفز لمّا تترك)
        const f = this._dragF;
        this.fill.style.width = `${f * 100}%`; this.knob.style.left = `${f * 100}%`;
        this.time.textContent = `${fmt(f * d)} / ${fmt(d)}`;
        return;
      }
      const p = v.currentTime / d;
      this.fill.style.width = `${p * 100}%`;
      this.knob.style.left = `${p * 100}%`;
      let b = 0;
      for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime + 1) b = Math.max(b, v.buffered.end(i));
      this.buf.style.width = `${Math.min(1, b / d) * 100}%`;
      this.time.textContent = `${fmt(v.currentTime)} / ${fmt(d)}`;
      if (this.chapters.length) this._chapLabel();
    }

    _showUI(stay) {
      this.box.classList.add('ui');
      clearTimeout(this._hideT);
      if (!stay && !this.video.paused) this._hideT = setTimeout(() => this._hideUI(), 2800);
    }
    _hideUI() { if (!this._sheet && this.menu.hidden && !this.video.paused && !this.box.classList.contains('drag')) this.box.classList.remove('ui'); } // ماسك الشريط؟ ما منخبّي شي

    /* ---------- الجودة ---------- */
    _tracks() {
      if (!this.shaka) return [];
      const seen = new Map();
      for (const t of this.shaka.getVariantTracks()) {
        if (!t.height) continue;
        const cur = seen.get(t.height);
        if (!cur || t.bandwidth > cur.bandwidth) seen.set(t.height, t);
      }
      return [...seen.values()].sort((a, b) => b.height - a.height);
    }
    _updQ() {
      const act = this.shaka && this.shaka.getVariantTracks().find(t => t.active);
      this.qBadge.textContent = act && act.height >= 720 ? 'HD' : '';
    }
    /* ---------- الترجمة (بيعطيها app.js من السيرفر) ---------- */
    setCaptions(list) {
      this.captions = (list || []).filter(c => c && c.url);
      const P = window.nuvioPref;
      if (P && P.get('cc') && this.captions.length && !this.capSel && this.shaka) {
        const want = ls.get('cap', '') || 'ar';
        const c = this.captions.find(x => x.lang === want && !x.auto) || this.captions.find(x => x.lang === want) || this.captions.find(x => !x.auto) || this.captions[0];
        if (c) this._pickCaption(c, true);
      }
    }
    async _pickCaption(c, auto) {
      const v = this.video;
      this.capSel = c ? c.label : '';
      if (!auto) { ls.set('cap', c ? c.lang : ''); if (window.nuvioPref) window.nuvioPref.set('cc', !!c); }
      if (this.shaka) {
        if (!c) { this.shaka.setTextTrackVisibility(false); return; }
        try {
          const tr = await this.shaka.addTextTrackAsync(c.url, c.lang || 'und', 'subtitles', 'text/vtt', undefined, c.label);
          this.shaka.selectTextTrack(tr);
          await this.shaka.setTextTrackVisibility(true);
        } catch (e) { console.warn('[nuvio] caption', e); }
        return;
      }
      [...v.querySelectorAll('track')].forEach(t => t.remove());
      if (!c) return;
      const tr = document.createElement('track');
      Object.assign(tr, { kind: 'subtitles', label: c.label, srclang: c.lang || 'und', src: c.url, default: true });
      v.append(tr);
      tr.addEventListener('load', () => { tr.track.mode = 'showing'; });
    }

    /* ---------- قائمة الإعدادات (متل يوتيوب)، وكل خيار بيبيّن بس إذا متوفر ----------
       كمبيوتر (ماوس) والمشغّل عريض: قائمة صغيرة بتطلع فوق زر الإعدادات مباشرة.
       تلفون وتلفزيون: بتطلع من تحت لفوق (أسهل بالإصبع وبالريموت). */
    _menu(open) {
      if (this._sheet) { this._closeSheet(); return; }
      const v = this.video;
      const fs = document.fullscreenElement === this.box || !!this._fakeFs; // الآيفون مكبّر (ملء شاشة تبعنا): القائمة جوّا المشغّل، مش تحتو
      const pop = !document.documentElement.classList.contains('tv') && matchMedia('(hover: hover) and (pointer: fine)').matches && this.box.getBoundingClientRect().width >= 520;
      const ov = mk('div', 'np-sheet-ov' + (fs ? ' in-fs' : '') + (pop ? ' pop' : ''));
      const sh = mk('div', 'np-sheet'); sh.dir = 'rtl';
      ov.append(sh);
      ov.addEventListener('click', e => { if (e.target === ov) this._closeSheet(); });
      (fs || pop ? this.box : document.body).append(ov);
      this._sheet = ov; this._sheetLock = !pop;
      if (!pop) lockScroll(true);
      // اللمس برّا القائمة ما بيحرّك الصفحة ورا
      ov.addEventListener('touchmove', e => { if (!e.target.closest('.np-sheet')) e.preventDefault(); }, { passive: false });
      if (pop) {
        // مكانها: طرفها اليمين مع طرف زر الإعدادات، وتحتها فوق الزر مباشرة
        const place = () => {
          const br = this.box.getBoundingClientRect(), gr = this.bGear.getBoundingClientRect();
          const w = Math.min(330, br.width - 16);
          let right = 12, bottom = 64;
          if (gr.width) {
            const bt = this.bar && this.bar.getBoundingClientRect().height ? this.bar.getBoundingClientRect().top : gr.top; // فوق شريط التقدّم كمان
            right = Math.round(br.right - gr.right - 6); bottom = Math.round(br.bottom - Math.min(gr.top, bt) + 8);
          }
          right = Math.min(Math.max(8, right), Math.max(8, br.width - w - 8));
          Object.assign(sh.style, { right: right + 'px', bottom: bottom + 'px', width: w + 'px', maxHeight: Math.max(150, br.height - bottom - 10) + 'px' });
        };
        place();
        // كبسة برّا المشغّل أو Esc بتسكّرها
        const outside = e => { if (!this.box.contains(e.target)) this._closeSheet(); };
        const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); this._closeSheet(); } };
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('keydown', esc, true);
        window.addEventListener('resize', place);
        this._sheetOff = () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc, true); window.removeEventListener('resize', place); };
      }
      this._showUI(true);
      const I = {
        q: '<path class="s" d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle class="s" cx="15" cy="7" r="2.2"/><circle class="s" cx="9" cy="17" r="2.2"/>',
        sp: '<path class="s" d="M5 18a8 8 0 1 1 14 0"/><path class="s" d="M12 14l4-5"/>',
        cc: '<rect class="s" x="3" y="5" width="18" height="14" rx="2.5"/><path class="s" d="M10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3"/>',
        au: '<circle class="s" cx="9" cy="8" r="3.2"/><path class="s" d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5M17 8.5a3.5 3.5 0 0 1 0 5M19.5 6.5a6.5 6.5 0 0 1 0 9"/>',
        sl: '<path class="s" d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
        lp: '<path class="s" d="M17 2.5l3 3-3 3M4 11V9.5a4 4 0 0 1 4-4h12M7 21.5l-3-3 3-3M20 13v1.5a4 4 0 0 1-4 4H4"/>',
        ch: '<path class="s" d="M4 6h16M4 12h10M4 18h13"/>',
        ap: '<path class="s" d="M4 6.5v11l7-5.5zM13 6.5v11l7-5.5z"/>',
        sb: '<path class="s" d="M5 5l7 7-7 7M13 5l7 7-7 7"/>',
        tv: '<rect class="s" x="3" y="4.5" width="18" height="12" rx="2"/><path class="s" d="M8.5 20h7M12 16.5V20"/>',
        sv: '<path class="s" d="M3 12h2M7 8v8M11 5v14M15 8v8M19 10v4M21 12h0"/>',
        vb: '<path class="s" d="M5 9v6h3l5 4V5L8 9H5zM16.5 8.5a5 5 0 0 1 0 7"/>',
        am: '<rect class="s" x="5" y="7" width="14" height="10" rx="1.5"/><path class="s" d="M3 4l2 2M21 4l-2 2M3 20l2-2M21 20l-2-2M12 2v2M12 20v2"/>',
        vf: '<path class="s" d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1-.1-2.2 1.2-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1.4"/><circle cx="10.5" cy="7" r="1.4"/><circle cx="15" cy="7.5" r="1.4"/>',
        hp: '<path class="s" d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect class="s" x="3" y="14" width="4" height="6" rx="1.5"/><rect class="s" x="17" y="14" width="4" height="6" rx="1.5"/>',
      };
      const icon = k => `<svg viewBox="0 0 24 24">${I[k]}</svg>`;
      const row = (k, label, value, onClick, toggle) => {
        const r = mk('button', 'np-row');
        const l = mk('span', 'np-row-l'); l.textContent = label;
        r.append(mk('span', 'np-row-ico', icon(k)), l);
        if (toggle != null) r.append(mk('span', 'np-sw' + (toggle ? ' on' : ''), '<span></span>'));
        else { const val = mk('span', 'np-row-v'); val.textContent = value || ''; r.append(val, mk('span', 'np-row-c', '‹')); }
        r.onclick = e => { e.stopPropagation(); onClick(r); };
        return r;
      };
      const sub = (title, opts) => {
        sh.replaceChildren(mk('div', 'np-grip'));
        const h = mk('button', 'np-sub-h'); h.textContent = '› ' + title;
        h.onclick = e => { e.stopPropagation(); main(); };
        sh.append(h);
        opts.forEach(([label, on, fn]) => {
          const b = mk('button', 'np-opt' + (on ? ' on' : ''));
          b.textContent = label;
          b.onclick = e => { e.stopPropagation(); fn(); this._closeSheet(); };
          sh.append(b);
        });
      };
      // صفحة شرح قصيرة (بدل خيارات) — مع رجوع للقائمة
      const note = (title, text) => {
        sh.replaceChildren(mk('div', 'np-grip'));
        const h = mk('button', 'np-sub-h'); h.textContent = '› ' + title;
        h.onclick = e => { e.stopPropagation(); main(); };
        const p = mk('div', 'np-note'); p.textContent = text;
        sh.append(h, p);
      };
      // فلتر الألوان: تشغيل/إيقاف، جاهزات، وسلايدرات — كل تغيير بيبيّن فوراً عالفيديو
      const vfPanel = () => {
        sh.replaceChildren(mk('div', 'np-grip'));
        const h = mk('button', 'np-sub-h'); h.textContent = '› فلتر الألوان';
        h.onclick = e => { e.stopPropagation(); main(); };
        let o = vfGet();
        const onRow = row('vf', 'تشغيل الفلتر', '', () => { o = { ...o, on: !o.on }; vfSet(o); sync(); }, o.on);
        const chips = mk('div', 'np-vf-pre');
        const mineBox = mk('div', 'np-vf-pre');
        const sliders = mk('div', 'np-vf-sls');
        const inputs = {};
        const embed = !!(this.opts.media && this.video.applyCc); // مشغّل يوتيوب المضمّن: الحدّة ما بتمشي
        const drawMine = () => {
          mineBox.replaceChildren();
          const l = vfMine();
          if (!l.length) { const e = mk('div', 'np-vf-empty'); e.textContent = 'لسّا ما حفظت فلتر. عدّل تحت واكبس «احفظ هالإعدادات».'; mineBox.append(e); return; }
          for (const m of l) {
            const b = mk('button', 'np-vf-chip mine'); b.dataset.p = m.id;
            const t = mk('span'); t.textContent = m.name;
            const x = mk('span', 'np-vf-x', '×'); x.title = 'امسح';
            x.onclick = e => { e.stopPropagation(); vfMineSet(vfMine().filter(y => y.id !== m.id)); if (o.p === m.id) o = { ...o, p: 'custom' }; vfSet(o); drawMine(); sync(); };
            b.append(t, x);
            b.onclick = e => { e.stopPropagation(); const v = {}; VF_KEYS.forEach(k => { v[k] = m[k] != null ? m[k] : VF_DEF[k]; }); o = { ...o, ...v, p: m.id, on: true }; vfSet(o); sync(); };
            mineBox.append(b);
          }
          sync();
        };
        function sync() {
          [...chips.querySelectorAll('button'), ...mineBox.querySelectorAll('button')].forEach(b => b.classList.toggle('on', o.on && b.dataset.p === o.p));
          for (const [k, , , , , f] of VF_SLIDERS) { const it = inputs[k]; if (it) { it.input.value = o[k]; it.val.textContent = f(o[k]); } }
          onRow.querySelector('.np-sw').classList.toggle('on', o.on);
          sliders.classList.toggle('off', !o.on);
        }
        for (const [id, label, val] of VF_PRESETS) {
          const b = mk('button', 'np-vf-chip'); b.textContent = label; b.dataset.p = id;
          b.onclick = e => { e.stopPropagation(); o = { ...o, ...val, p: id, on: true }; vfSet(o); sync(); };
          chips.append(b);
        }
        for (const [k, label, min, max, step, f] of VF_SLIDERS) {
          const line = mk('label', 'np-vf-sl' + (k === 'k' && embed ? ' dis' : ''));
          const name = mk('span', 'np-vf-n'); name.textContent = label;
          const input = mk('input'); input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = o[k]; input.dir = 'ltr';
          const val = mk('span', 'np-vf-v'); val.textContent = f(o[k]);
          if (k === 'k' && embed) input.disabled = true;
          input.addEventListener('input', () => { o = { ...o, [k]: +input.value, p: 'custom', on: true }; vfSet(o); sync(); });
          ['pointerdown', 'click', 'touchstart'].forEach(n => input.addEventListener(n, e => e.stopPropagation(), { passive: true }));
          line.append(name, input, val);
          sliders.append(line);
          inputs[k] = { input, val };
        }
        const reset = mk('button', 'np-vf-reset'); reset.textContent = 'رجّع الصورة الأصلية';
        reset.onclick = e => { e.stopPropagation(); o = { ...VF_DEF }; vfSet(o); sync(); };
        // احفظ الإعدادات الحالية باسم ← بتطلع بـ«فلاتري»
        const save = mk('div', 'np-vf-save');
        const nameIn = mk('input'); nameIn.type = 'text'; nameIn.maxLength = 24; nameIn.placeholder = 'اسم الفلتر'; nameIn.dir = 'auto';
        const saveB = mk('button', 'np-vf-reset'); saveB.textContent = 'احفظ هالإعدادات';
        ['pointerdown', 'click', 'touchstart', 'keydown'].forEach(n => nameIn.addEventListener(n, e => e.stopPropagation(), { passive: true }));
        saveB.onclick = e => {
          e.stopPropagation();
          const l = vfMine();
          const name = (nameIn.value || '').trim() || `فلتري ${l.length + 1}`;
          const m = { id: 'm' + Date.now().toString(36), name };
          VF_KEYS.forEach(k => { m[k] = o[k]; });
          vfMineSet([...l.filter(x => x.name !== name), m]);
          o = { ...o, p: m.id, on: true }; vfSet(o);
          nameIn.value = ''; drawMine();
          saveB.textContent = 'انحفظ ✓'; setTimeout(() => { saveB.textContent = 'احفظ هالإعدادات'; }, 1500);
        };
        save.append(nameIn, saveB);
        const t1 = mk('div', 'np-vf-t'); t1.textContent = 'جاهزات';
        const t3 = mk('div', 'np-vf-t'); t3.textContent = 'فلاتري';
        const t2 = mk('div', 'np-vf-t'); t2.textContent = 'تعديل يدوي';
        const parts = [h, onRow, t1, chips, t3, mineBox, t2, sliders];
        if (embed) { const n = mk('div', 'np-vf-empty'); n.textContent = 'حدّة الصورة بتشتغل بمشغّل Nuvio بس — هالفيديو شغّال بمشغّل يوتيوب المضمّن (المتصفح ما بيسمح).'; parts.push(n); }
        sh.append(...parts, save, reset);
        drawMine();
        sync();
      };
      const vfLabel = () => { const o = vfGet(); if (!o.on) return 'مطفي'; const p = VF_PRESETS.find(x => x[0] === o.p); if (p) return p[1]; const m = vfMine().find(x => x.id === o.p); return m ? m.name : 'مخصّص'; };
      // الترتيب متل يوتيوب: المفاتيح فوق، والجودة تحت (أقرب شي للزر)
      const main = () => {
        sh.replaceChildren(mk('div', 'np-grip'));
        const PF = window.nuvioPref;
        // مستوى الصوت الثابت + تحسين الصوت (بمشغّلنا بس)
        if (PF && this.canAudioFx()) {
          sh.append(row('sv', 'مستوى الصوت الثابت', '', r => { PF.set('stableVol', !PF.get('stableVol')); r.querySelector('.np-sw').classList.toggle('on', !!PF.get('stableVol')); this.applyAudioFx(); }, !!PF.get('stableVol')));
          sh.append(row('vb', 'تحسين الصوت (الكلام أوضح)', '', r => { PF.set('voiceBoost', !PF.get('voiceBoost')); r.querySelector('.np-sw').classList.toggle('on', !!PF.get('voiceBoost')); this.applyAudioFx(); }, !!PF.get('voiceBoost')));
        }
        // التلفون: من وين بيجي الصوت لمّا تسكّر الشاشة (من تلفونك = السكربت/التطبيق، من سيرفرنا، أو لسّا مش جاهز)
        if (!DESKTOP) {
          const u = this.bgUrl || '';
          const fromPhone = /googlevideo\.com/.test(u), fromUs = /tube\.glanzstar\.de/.test(u);
          const val = fromPhone ? 'من تلفونك ✓' : fromUs ? 'من سيرفرنا' : 'مش جاهز';
          const why = fromPhone ? 'لمّا تسكّر الشاشة أو تطلع من سفاري، الصوت بيكمّل من نت تلفونك مباشرة — السكربت (أو التطبيق) شغّال، وبلا سيرفرنا.'
            : fromUs ? 'لمّا تسكّر الشاشة، الصوت بيكمّل من سيرفرنا (إذا كان شغّال). لتخلّيه من تلفونك مباشرة: افتح Nuvio من سفاري وركّب سكربت الآيفون (القائمة ← الإعدادات ← «صوت بالخلفية عالآيفون»).'
              : 'لسّا ما في صوت جاهز لهالفيديو بالخلفية. استنّى كم ثانية بعد ما يبلّش الفيديو وافتح القائمة كمان مرة.';
          sh.append(row('hp', 'الصوت بالخلفية', val, () => note('الصوت بالخلفية', why)));
        }
        // الإضاءة السينمائية (كمبيوتر، الثيم الغامق)
        if (PF && window.nuvioAmbientOk && window.nuvioAmbientOk()) sh.append(row('am', 'الإضاءة السينمائية', '', r => { PF.set('ambient', PF.get('ambient') === false); r.querySelector('.np-sw').classList.toggle('on', PF.get('ambient') !== false); }, PF.get('ambient') !== false));
        // فلتر الألوان
        sh.append(row('vf', 'فلتر الألوان', vfLabel(), () => vfPanel()));
        // تكرار
        sh.append(row('lp', 'تكرار الفيديو', '', r => { this.setLoop(!this.loop); r.querySelector('.np-sw').classList.toggle('on', this.loop); }, !!this.loop));
        // إعدادات عامة من app.js
        const P = window.nuvioPref;
        if (P) {
          sh.append(row('ap', 'تشغيل تلقائي', '', r => { P.set('autoplay', !P.get('autoplay')); r.querySelector('.np-sw').classList.toggle('on', P.get('autoplay')); }, !!P.get('autoplay')));
          sh.append(row('sb', 'تخطّي الدعايات جوّا الفيديو', '', r => { P.set('sb', !P.get('sb')); r.querySelector('.np-sw').classList.toggle('on', P.get('sb')); }, !!P.get('sb')));
        }
        // مشغّل يوتيوب: الترجمة (CC) تشغيل/إيقاف — بتنحفظ لكل الفيديوهات
        if (this.opts.media && this.video.applyCc && window.nuvioPref) {
          const PP = window.nuvioPref;
          sh.append(row('cc', 'الترجمة (CC)', '', r => { PP.set('cc', !PP.get('cc')); this.video.applyCc(); r.querySelector('.np-sw').classList.toggle('on', !!PP.get('cc')); }, !!PP.get('cc')));
        }
        // الفصول (إذا في)
        if (this.chapters.length) {
          const c = this._chapAt(v.currentTime || 0);
          sh.append(row('ch', 'الفصول', c && c.title ? c.title.slice(0, 22) : `${this.chapters.length}`, chSub));
        }
        // شغّل على جهاز تاني (كمبيوتر / تلفزيون فاتح Nuvio بنفس الحساب)
        if (this.opts.onOther) sh.append(row('tv', 'شغّل على جهاز تاني', '', () => { this._closeSheet(); this.opts.onOther(); }));
        // المقطع الصوتي: الدبلجات (العربي وغيرو) — اختيارك بينحفظ للفيديوهات الجاية
        if (this.shaka && this.shaka.getAudioLanguagesAndRoles) {
          const langs = this.shaka.getAudioLanguagesAndRoles();
          if (langs.length > 1) {
            const act = this.shaka.getVariantTracks().find(t => t.active) || {};
            const orig = l => l.role === 'main';
            const name = l => langName(l.language) + (orig(l) ? ' (الأصلي)' : '');
            // الأصلي أول، بعدو العربي، والباقي بالترتيب
            const list = langs.slice().sort((a, b) => (orig(b) - orig(a)) || ((b.language === 'ar') - (a.language === 'ar')) || name(a).localeCompare(name(b), 'ar'));
            const cur = list.find(l => l.language === act.language && (!l.role || (act.audioRoles || []).includes(l.role))) || list.find(l => l.language === act.language);
            sh.append(row('au', 'المقطع الصوتي', cur ? name(cur) : '', () => sub(this.chId ? 'المقطع الصوتي (لكل فيديوهات القناة)' : 'المقطع الصوتي',
              list.map(l => [name(l), l === cur, () => {
                this.shaka.selectAudioLanguage(l.language, l.role || undefined);
                if (this.chId) { const m = ls.get('audCh', {}); if (orig(l)) delete m[this.chId]; else m[this.chId] = l.language; ls.set('audCh', m); } // بينحفظ لهالقناة بس
              }]))));
          }
        } else if (this.opts.media && this.video.applyCc) {
          // مشغّل يوتيوب المضمّن: ما في أمر رسمي يغيّر لغة الصوت من برّا الإطار
          sh.append(row('au', 'المقطع الصوتي', 'الأصلي', () => note('المقطع الصوتي',
            'هون الفيديو شغّال بمشغّل يوتيوب المضمّن، وهو ما بيسمح نغيّر لغة الصوت (بيضل على الأصلي). بتطبيق Nuvio عالأندرويد، أو بالكمبيوتر مع إضافة Nuvio، الفيديو بيشتغل بمشغّلنا وبتقدر تختار العربي وكل الدبلجات.')));
        }
        // الترجمة (إذا في)
        if (this.captions && this.captions.length) {
          sh.append(row('cc', 'الترجمة والشرح', this.capSel || 'إيقاف', () => sub('الترجمة والشرح', [
            ['إيقاف', !this.capSel, () => this._pickCaption(null)],
            ...this.captions.map(c => [c.label, this.capSel === c.label, () => this._pickCaption(c)]),
          ])));
        }
        // مؤقت الإيقاف (من app.js)
        if (typeof setSleep === 'function' && typeof SLEEP_OPTS !== 'undefined') {
          const st = typeof sleepState !== 'undefined' ? sleepState : {};
          const val = st.endOfVideo ? 'آخر الفيديو' : st.at ? `${Math.max(1, Math.ceil((st.at - Date.now()) / 60000))} د` : 'غير مفعّل';
          sh.append(row('sl', 'مؤقّت إيقاف التشغيل', val, () => sub('مؤقّت إيقاف التشغيل',
            SLEEP_OPTS.map(([m, label]) => [label, m === 0 ? !st.at && !st.endOfVideo : m === -1 ? !!st.endOfVideo : false, () => setSleep(m, () => this)]))));
        }
        // السرعة
        sh.append(row('sp', 'سرعة التشغيل', v.playbackRate === 1 ? 'عادي' : `${v.playbackRate}×`, () => sub('سرعة التشغيل',
          SPEEDS.map(s => [s === 1 ? 'عادي' : `${s}×`, v.playbackRate === s, () => { v.playbackRate = s; this.rate = s; }]))));
        // الجودة (تحت، جنب الزر)
        const tracks = this._tracks();
        if (tracks.length) {
          const abr = this.shaka.getConfiguration().abr.enabled;
          const act = this.shaka.getVariantTracks().find(t => t.active);
          const hd = h => (h >= 720 ? ' HD' : '');
          sh.append(row('q', 'الجودة', abr ? `تلقائية${act ? ` (${act.height}p${hd(act.height)})` : ''}` : `${act ? act.height : ''}p${act ? hd(act.height) : ''}`, () => sub('الجودة', [
            [`تلقائية${act ? ` (${act.height}p)` : ''}`, abr, () => { this.shaka.configure({ abr: { enabled: true } }); ls.set('q', 0); }],
            ...tracks.map(t => [`${t.height}p${hd(t.height)}`, !abr && act && act.height === t.height, () => {
              this.shaka.configure({ abr: { enabled: false } });
              this.shaka.selectVariantTrack(t, true, 4);
              ls.set('q', t.height); this._updQ();
            }]),
          ])));
        }
      };
      const chSub = () => sub('الفصول', this.chapters.map(c => [`${fmt(c.t)}   ${c.title || ''}`, this._chapAt(v.currentTime || 0) === c, () => { v.currentTime = c.t + 0.05; v.play().catch(() => {}); }]));
      main();
      if (open === 'ch' && this.chapters.length) chSub();
      requestAnimationFrame(() => ov.classList.add('open'));
    }
    _closeSheet() {
      const ov = this._sheet; if (!ov) return;
      this._sheet = null;
      if (this._sheetLock) lockScroll(false);
      if (this._sheetOff) { this._sheetOff(); this._sheetOff = null; }
      ov.classList.remove('open');
      setTimeout(() => ov.remove(), 260);
      this._showUI();
    }
    /* إذا اخترت جودة قبل، رجّعها */
    applySavedQuality() {
      const q = ls.get('q', 0);
      if (!q || !this.shaka) return;
      if (window.nuvioSaver && window.nuvioSaver() && q > 480) return; // توفير الإنترنت
      // منبلّش خفيف (بداية أسرع)، ومنحوّل للجودة اللي اخترتها أول ما يبلّش الفيديو
      const sp = this.shaka;
      this.video.addEventListener('playing', () => setTimeout(() => {
        if (this.shaka !== sp) return;
        const t = this._tracks().find(x => x.height === q);
        if (t) { sp.configure({ abr: { enabled: false } }); sp.selectVariantTrack(t, false); this._updQ(); }
      }, 1200), { once: true });
    }

    /* ---------- مراقب التعليق ----------
       إذا المفروض الفيديو عم يشتغل بس الوقت ما عم يتحرّك لمدة 10 ثواني، منطلب إعادة تحميل من نفس النقطة. */
    _watchdog() {
      let last = -1, stuck = 0;
      this._wd = setInterval(() => {
        const v = this.video;
        if (this.dead || !v.isConnected) return this.destroy();
        const wants = !v.paused && !v.ended && v.readyState > 0;
        if (wants && Math.abs(v.currentTime - last) < 0.05) stuck++; else stuck = 0;
        last = v.currentTime;
        if (stuck >= 10) { stuck = 0; this.opts.onStall && this.opts.onStall(v.currentTime); }
      }, 1000);
    }
  }


  /* ================= مشغّل يوتيوب المضمّن بواجهتنا =================
     بيتصرّف متل عنصر <video> (play / pause / currentTime / الأحداث…) فمشغّلنا كلّو بيشتغل فوقو،
     بس التشغيل الفعلي جوّا إطار يوتيوب على جهاز المستخدم: منبعتلو أوامر رسمية (postMessage) ومنسمع حالتو.
     الإطار مقصوص من فوق ومن تحت (العنوان وشعار يوتيوب برّا الصورة) ومسكّر عاللمس — كل الكبسات لواجهتنا.
     قبل ما نتأكد إنو الفيديو نفسو هو اللي عم يمشي (مش إعلان)، ما منحكي لمشغّلنا شي (revealed = false). */
  class YtMedia extends EventTarget {
    constructor(id) {
      super();
      this.id = id;
      this.el = mk('div', 'yt-frame');
      const f = this.f = document.createElement('iframe');
      f.allow = 'autoplay; encrypted-media; picture-in-picture';
      f.referrerPolicy = 'strict-origin-when-cross-origin'; // بلاها يوتيوب بيطلّع «خطأ 153»
      f.tabIndex = -1; f.setAttribute('aria-hidden', 'true');
      this.el.append(f);
      this.st = -1; this.ct = 0; this.ctAt = 0; this.ct0 = -1; this.ctMoveAt = 0; this.dur = 0; this.curDur = 0; this.frac = 0; this.vid = '';
      this.revealed = false; this.wantPlay = true; this.seekingTo = null; this.loop = false;
      this._muted = true; this._vol = 1; this._wantMuted = false; this._wantVol = 1; this._wantRate = 1;
      this.playsInline = true; this.preload = 'auto'; this.autoplay = true; this.poster = ''; this.disableRemotePlayback = true; this.error = null;
      this._onMsg = e => this._msg(e);
      window.addEventListener('message', this._onMsg);
      f.addEventListener('load', () => {
        const w = f.ownerDocument && f.ownerDocument.defaultView; if (w && w !== window) this.listenOn(w); // الإطار بالنافذة العايمة: رسايلو بتروح لهونيك
        this._listen(); setTimeout(() => this._listen(), 400); setTimeout(() => this._listen(), 1200);
      });
    }
    /* الموبايل (خاصة الآيفون) ما بيشغّل لحالو بالإطار رغم autoplay: منبعت «بلا صوت + شغّل» كذا مرة لحد ما يمشي */
    _kick() {
      if (this._kicking) return;
      this._kicking = true;
      let n = 0;
      const go = () => {
        if (!this.f.isConnected || n++ > 8 || !this.wantPlay || this.st === 1 || this.st === 3) { this._kicking = false; return; }
        if (!this.revealed) this.cmd('mute');
        this.cmd('playVideo');
        setTimeout(go, 700);
      };
      go();
    }
    /* الآيفون رفض يشغّل لحالو (أو يوتيوب عم يتأخّر كتير): منبيّن زر التشغيل تبعنا، بس:
       - منضل نحاول بالخلفية، وإذا بلّش لحالو بيكمّل (ما منوقّفو متل قبل)
       - أول كبسة منك بأي محل بالصفحة بتشغّلو (الكبسة بتوصل للإطار ومعها إذن التشغيل والصوت) */
    block() {
      if (this._blocked || this.revealed) return;
      this._blocked = true;
      this._emit('pause');
      let n = 0;
      const again = () => {
        if (!this._blocked || this.revealed || !this.f.isConnected || n++ > 40) return;
        this.cmd('mute'); this.cmd('playVideo');
        setTimeout(again, 1500);
      };
      setTimeout(again, 1500);
      const evs = ['pointerup', 'touchend', 'click'];
      const off = () => { evs.forEach(n => window.removeEventListener(n, onTap)); if (this._unblockTap === off) this._unblockTap = null; };
      const onTap = e => {
        if (!this._blocked || this.revealed || !this.f.isConnected) { off(); return; }
        const t = e.target instanceof Element ? e.target : null;
        if (t && t.closest('.np-big, .np-bottom, .np-menu, .np-sheet, .np-sheet-ov, .np-unmute, .own-fail, .short')) return; // أزرار المشغّل (والشورتس) بتشغّل لحالها
        if (t && e.pointerType === 'mouse' && t.closest('.np-ui')) return; // الماوس عالفيديو: المشغّل نفسو بيشغّل/بيوقّف
        if (e.type !== 'click' && !YtMedia.gesture()) return; // سحب/تمرير مش كبسة
        off(); this.play();
      };
      if (this._unblockTap) this._unblockTap();
      this._unblockTap = off;
      evs.forEach(n => window.addEventListener(n, onTap));
    }
    get blocked() { return !!this._blocked; }
    setAttribute() { /* متل <video> */ }
    removeAttribute() { /* */ }
    get isConnected() { return this.el.isConnected; }
    load(start) {
      this.revealed = false;
      this.st = -1; this.vid = ''; this.curDur = 0; this.ct0 = -1; this.ctMoveAt = 0; this.seekingTo = null;
      this.t0 = Math.max(0, Math.floor(start || 0)); this.ct = this.t0; this.ctAt = 0;
      this.loadAt = Date.now(); this._kicking = false;
      this._blocked = false; if (this._unblockTap) this._unblockTap();
      this._ccN = 0; this._ccSched = false; this.readyAt = 0;
      const cc = YtMedia.ccOn() ? '&cc_load_policy=1&cc_lang_pref=ar' : '';
      const url = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(this.id)}?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&rel=0&playsinline=1&enablejsapi=1${cc}&start=${this.t0}&origin=${encodeURIComponent(location.origin)}&_=${Date.now()}`;
      // بالنافذة العايمة (بلا عنوان) يوتيوب بيرفض: منمرّق عبر صفحة وسيطة من موقعنا (ytpip.html)
      this.f.src = this.f.ownerDocument !== document ? `${new URL('ytpip.html', location.href).href}#${encodeURIComponent(url)}` : url;
      this._emit('loadstart'); this._emit('waiting');
    }
    _post(o) { try { this.f.contentWindow.postMessage(JSON.stringify({ id: 'nuvio', channel: 'widget', ...o }), '*'); } catch { /* */ } }
    _listen() { this._post({ event: 'listening' }); }
    cmd(func, args = []) { this._post({ event: 'command', func, args }); }
    _emit(n) { this.dispatchEvent(new Event(n)); }
    _msg(e) {
      if (e.source !== this.f.contentWindow) return;
      let d = e.data; try { d = typeof d === 'string' ? JSON.parse(d) : d; } catch { return; }
      if (!d || typeof d !== 'object') return;
      if (d.event === 'onError') { this.errorCode = d.info; this._emit('yterror'); return; }
      if (d.event === 'onReady' || d.event === 'initialDelivery') { if (!this.readyAt) this.readyAt = Date.now(); this._kick(); this.applyCc(); if (d.event === 'onReady') this.cmd('addEventListener', ['onApiChange']); }
      // يوتيوب بيحمّل الترجمة لحالو (بيتذكّر آخر مرة شغّلتها، أو صاحب الفيديو مفعّلها): إذا مطفية عنا، منرجع نطفيها
      if (d.event === 'onApiChange' && !YtMedia.ccOn()) this.applyCc();
      const i = d.info; if (!i || typeof i !== 'object') return;
      if (i.videoData && i.videoData.video_id) this.vid = i.videoData.video_id;
      const pd = (i.progressState && i.progressState.duration) || i.duration;
      if (pd > 0) {
        this.curDur = pd;
        if (!this.dur && i.playerState !== 1 && this.st !== 1) this.dur = pd; // أول مدة قبل التشغيل = مدة الفيديو نفسو
      }
      if (typeof i.videoLoadedFraction === 'number') { this.frac = i.videoLoadedFraction; if (this.revealed) this._emit('progress'); }
      const mv0 = this._muted;
      if (typeof i.muted === 'boolean') this._muted = i.muted;
      if (typeof i.volume === 'number') this._vol = i.volume / 100;
      if (this.revealed && mv0 !== this._muted) this._emit('volumechange');
      if (typeof i.currentTime === 'number') {
        if (this.ct0 < 0) this.ct0 = i.currentTime;
        if (Math.abs(i.currentTime - this.ct) > 0.05) this.ctMoveAt = Date.now();
        this.ct = i.currentTime; this.ctAt = performance.now();
        if (this.seekingTo != null && Math.abs(this.ct - this.seekingTo) < 2) { this.seekingTo = null; if (this.revealed) this._emit('seeked'); }
        if (this.revealed) this._emit('timeupdate');
      }
      if (typeof i.playerState === 'number' && i.playerState !== this.st) {
        const prev = this.st; this.st = i.playerState;
        if (this.st === 3) this.bufSince = Date.now(); // يوتيوب عم يحمّل (نت بطيء): هو بيكمّل لحالو
        if (this.st === 1 && (this._ccN < 3 || !YtMedia.ccOn())) { this._ccN++; this.applyCc(); } // يوتيوب بيشغّل الترجمة لحالو أحياناً لمّا يبلّش (أو بعد قفزة)
        // الترجمة مطفية عنا بس يوتيوب متذكّر إنك شغّلتها مرة: بيحمّلها بعد ما يبلّش الفيديو بشوي — منرجع نطفيها كم مرة
        if (this.st === 1 && !YtMedia.ccOn() && !this._ccSched) { this._ccSched = true; [1500, 4000, 9000].forEach(ms => setTimeout(() => { if (!YtMedia.ccOn() && this.f.isConnected) this.applyCc(); }, ms)); }
        if (this.revealed) this._stateEvents(prev);
      }
    }
    _stateEvents(prev) {
      const s = this.st;
      if (s === 1) { if (prev !== 3) this._emit('play'); this._emit('playing'); this._emit('canplay'); }
      else if (s === 2) this._emit('pause');
      else if (s === 3) this._emit('waiting');
      else if (s === 0) {
        if (this.loop) { this.cmd('seekTo', [0, true]); this.cmd('playVideo'); return; }
        this._emit('pause'); this._emit('ended');
      }
    }
    /* تأكدنا إنو الفيديو نفسو: منكشفو لمشغّلنا ومنطبّق الصوت والسرعة */
    reveal() {
      if (this.revealed) return;
      this.revealed = true;
      this._blocked = false; if (this._unblockTap) this._unblockTap(); // بلّش لحالو
      // الآيفون: إذا رجّعنا الصوت بلا كبسة منك، بيوقّف الفيديو وبيطلّع زر يوتيوب.
      // فمنخلّيه ماشي بلا صوت، ومشغّلنا بيبيّن «اكبس لتشغيل الصوت» (الكبسة بتوصل للإطار ومعها إذن الصوت)
      const quiet = !this._wantMuted && YtMedia.quietStart && !this._unlocked;
      this._muted = this._wantMuted || quiet;
      this.cmd(this._muted ? 'mute' : 'unMute');
      this.cmd('setVolume', [Math.round(Math.max(0, Math.min(1, this._wantVol)) * 100)]);
      if (this._wantRate !== 1) this.cmd('setPlaybackRate', [this._wantRate]);
      if (!this.wantPlay) this.cmd('pauseVideo');
      this._emit('durationchange'); this._emit('loadedmetadata'); this._emit('canplay'); this._emit('volumechange');
      if (this.st === 1 && this.wantPlay) { this._emit('play'); this._emit('playing'); }
      if (quiet) this._emit('automuted');
    }
    // كبسة منك هلّق؟ (بتوصل مع الأمر للإطار، فالآيفون بيسمح بالصوت)
    static gesture() { try { return !!(navigator.userActivation && navigator.userActivation.isActive); } catch { return false; } }
    hide() { this.revealed = false; this.cmd('mute'); this._emit('waiting'); }
    /* الترجمة (CC): حسب الإعداد «الترجمة» — مطفية بالأساس */
    static ccOn() { return !!(window.nuvioPref && window.nuvioPref.get('cc')); }
    applyCc() {
      if (YtMedia.ccOn()) { this.cmd('loadModule', ['captions']); this.cmd('setOption', ['captions', 'track', { languageCode: 'ar' }]); }
      else { this.cmd('setOption', ['captions', 'track', {}]); this.cmd('unloadModule', ['captions']); this.cmd('unloadModule', ['cc']); }
    }
    get currentTime() {
      if (this.seekingTo != null) return this.seekingTo;
      if (this.st === 1 && this.ctAt) return this.ct + Math.min(1, (performance.now() - this.ctAt) / 1000) * (this._wantRate || 1);
      return this.ct;
    }
    set currentTime(t) {
      t = Math.max(0, +t || 0);
      this.seekingTo = t; this.ct = t; this.ctAt = 0; this.lastSeekAt = Date.now(); this.ctMoveAt = Date.now();
      this.cmd('seekTo', [t, true]);
      this._emit('seeking'); this._emit('timeupdate');
    }
    get duration() { return this.dur || this.curDur || NaN; }
    get paused() { return this.revealed ? !(this.st === 1 || this.st === 3) : (!this.wantPlay || !!this._blocked); }
    get ended() { return this.revealed && this.st === 0; }
    get seeking() { return this.seekingTo != null; }
    get readyState() { return this.revealed ? 4 : 0; }
    get buffered() { const end = (this.frac || 0) * (this.duration || 0); return { length: end > 0 ? 1 : 0, start: () => 0, end: () => end }; }
    get videoWidth() { return 1920; }
    get videoHeight() { return 1080; }
    get muted() { return this.revealed ? this._muted : this._wantMuted; }
    set muted(m) { this._wantMuted = !!m; if (!m && YtMedia.gesture()) this._unlocked = true; if (this.revealed) { this.cmd(m ? 'mute' : 'unMute'); this._muted = !!m; this._emit('volumechange'); } }
    get volume() { return this._wantVol; }
    set volume(x) { this._wantVol = +x; if (this.revealed) { this.cmd('setVolume', [Math.round(Math.max(0, Math.min(1, +x)) * 100)]); this._emit('volumechange'); } }
    get playbackRate() { return this._wantRate || 1; }
    set playbackRate(r) { this._wantRate = +r || 1; this.cmd('setPlaybackRate', [this._wantRate]); }
    play() {
      if (YtMedia.gesture()) this._unlocked = true;
      if (!this.revealed && (!this.wantPlay || this._blocked)) this.loadAt = Date.now();
      this._blocked = false; if (this._unblockTap) this._unblockTap();
      this.wantPlay = true;
      this.cmd('playVideo'); this._kick(); return Promise.resolve();
    }
    pause() { this.wantPlay = false; this._blocked = false; if (this._unblockTap) this._unblockTap(); this.cmd('pauseVideo'); if (this.revealed && this.st !== 2 && this.st !== 0) { this.st = 2; this._emit('pause'); } }
    // رسايل الإطار بتوصل للنافذة اللي هو فيها (الصفحة أو النافذة العايمة)
    listenOn(w) { if (!w || w === window) return; (this._wins || (this._wins = new Set())).add(w); w.addEventListener('message', this._onMsg); }
    unlistenOn(w) { if (!w || !this._wins) return; this._wins.delete(w); try { w.removeEventListener('message', this._onMsg); } catch { /* */ } }
    destroy() {
      this._blocked = false; if (this._unblockTap) this._unblockTap();
      window.removeEventListener('message', this._onMsg);
      if (this._wins) { for (const w of this._wins) { try { w.removeEventListener('message', this._onMsg); } catch { /* */ } } this._wins.clear(); }
      try { this.f.src = 'about:blank'; } catch { /* */ }
    }
  }
  YtMedia.quietStart = IOS; // الآيفون/الآيباد: بيبلّش بلا صوت لحد ما تكبس (للتجربة بينغيّر من برّا)
  window.YtMedia = YtMedia;
  window.NuvioPlayer = NuvioPlayer;
})();
