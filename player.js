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

  class NuvioPlayer {
    constructor(box, opts = {}) {
      this.box = box; this.opts = opts; this.shaka = null; this.dead = false;
      box.classList.add('np'); box.dir = 'ltr'; box.tabIndex = 0;

      const v = this.video = document.createElement('video');
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
      this.bar.append(this.buf, this.fill, this.knob, this.tip);

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
      const volWrap = mk('div', 'np-volwrap'); volWrap.append(this.bVol, this.vol);
      this.bCast = mk('button', 'np-btn', ICON.tv); this.bCast.title = 'عرض على شاشة'; this.bCast.setAttribute('aria-label', 'عرض على شاشة'); this.bCast.hidden = true;
      this.bCast.onclick = e => { e.stopPropagation(); this.cast(); };
      this.bPip = mk('button', 'np-btn', ICON.pip); this.bPip.title = 'شاشة عايمة'; this.bPip.setAttribute('aria-label', 'شاشة عايمة');
      this.bPip.hidden = !(DESKTOP && this.canPip());
      this.bPip.onclick = e => { e.stopPropagation(); this.pip().catch(() => {}); };
      row.append(this.bPlay, volWrap, this.time, this.chapEl, mk('div', 'np-space'), this.bCast, this.bCopy, this.qBadge, this.bPip, this.bGear, this.bFs);
      bottom.append(this.bar, row);

      this.menu = mk('div', 'np-menu'); this.menu.dir = 'rtl'; this.menu.hidden = true;

      this.ui.append(this.spinner, this.big, this.seekL, this.seekR, this.msgEl, this.speedEl, bottom, this.menu);
      box.replaceChildren(v, this.ui);
      this._bind();
      this._showUI();
      this._watchdog();
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
    message(t) { this.msgEl.textContent = t || ''; this.msgEl.classList.toggle('on', !!t); }
    destroy() {
      this.dead = true; clearInterval(this._wd); clearTimeout(this._hideT);
      document.removeEventListener('keydown', this._key); document.removeEventListener('fullscreenchange', this._fsc);
      document.removeEventListener('visibilitychange', this._vis);
      if (this.bg) { this.bg.pause(); this.bg.removeAttribute('src'); this.bg.load(); }
    }

    /* ---------- أدوات القائمة العايمة ---------- */
    setLoop(on) {
      this.loop = !!on;
      this.video.loop = this.loop;
      if (this.bg) this.bg.loop = this.loop;
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
      if (DESKTOP) set('enterpictureinpicture', async () => {
        if (this.dead || document.pictureInPictureElement || this.video.paused) return;
        try { await this.video.requestPictureInPicture(); } catch { /* المتصفح ما سمح */ }
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
      if (this.unlocked || !this.bg || !this.bgUrl) return;
      if (this.bg.src !== this.bgUrl) this.bg.src = this.bgUrl;
      this.bg.muted = true;
      const p = this.bg.play();
      if (p) p.then(() => { this.bg.pause(); this.bg.muted = false; this.unlocked = true; }).catch(() => { this.bg.muted = false; });
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
        ls.set('vol', v.volume); ls.set('muted', v.muted);
      });
      v.addEventListener('error', () => this.opts.onError && this.opts.onError(v.currentTime));

      this.bPlay.onclick = () => this.toggle();
      this.big.onclick = e => { e.stopPropagation(); this.toggle(); this._showUI(); };
      this.bVol.onclick = () => { v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 0.5; };
      this.vol.oninput = () => { v.volume = +this.vol.value; v.muted = v.volume === 0; };
      this.bFs.onclick = () => this.fullscreen();
      this.bCopy.onclick = e => { e.stopPropagation(); this.opts.onCopy && this.opts.onCopy(); };
      this.bGear.onclick = e => { e.stopPropagation(); this._menu(); };

      // شريط التقدّم: سحب بالماوس أو بالإصبع
      const frac = e => { const r = this.bar.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
      let drag = false;
      this.bar.addEventListener('pointerdown', e => { drag = true; this.bar.setPointerCapture(e.pointerId); box.classList.add('drag'); this._seekTo(frac(e)); });
      this.bar.addEventListener('pointermove', e => {
        const f = frac(e);
        const ct = this.chapters.length ? this._chapAt(f * (v.duration || 0)) : null;
        this.tip.textContent = fmt(f * (v.duration || 0)) + (ct && ct.title ? `  •  ${ct.title}` : ''); this.tip.style.left = `${f * 100}%`;
        if (drag) this._seekTo(f);
      });
      const end = () => { drag = false; box.classList.remove('drag'); };
      this.bar.addEventListener('pointerup', end); this.bar.addEventListener('pointercancel', end);

      // ضغطة مطوّلة على الفيديو = سرعة 2× (متل يوتيوب)، ولمّا تشيل إصبعك بترجع متل ما كانت
      let holdT = 0, hx = 0, hy = 0, heldAt = 0;
      this.held = false;
      const startHold = e => {
        if (e.button > 0 || e.target.closest('.np-bottom, .np-menu, .np-big')) return;
        hx = e.clientX; hy = e.clientY;
        clearTimeout(holdT);
        holdT = setTimeout(() => {
          if (this.dead || v.ended || !this.menu.hidden) return;
          this.held = true;
          this._holdRate = v.playbackRate; this._holdPaused = v.paused;
          v.playbackRate = 2;
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
        if (Date.now() - heldAt < 80) return; // كانت ضغطة مطوّلة (تسريع)، مش كبسة
        if (e.target.closest('.np-bottom, .np-menu, .np-big')) return;
        if (!this.menu.hidden) { this.menu.hidden = true; return; }
        const touch = e.pointerType === 'touch';
        const now = Date.now();
        const r = box.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width;
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
      this._key = e => {
        if (this.dead || !box.isConnected) return;
        if (e.target.closest && e.target.closest('input, textarea, select')) return;
        const k = e.key.toLowerCase();
        const map = {
          ' ': () => this.toggle(), k: () => this.toggle(), f: () => this.fullscreen(), m: () => { v.muted = !v.muted; },
          arrowleft: () => this.skip(-5), arrowright: () => this.skip(5), j: () => this.skip(-10), l: () => this.skip(10),
          arrowup: () => { v.volume = Math.min(1, v.volume + 0.1); v.muted = false; },
          arrowdown: () => { v.volume = Math.max(0, v.volume - 0.1); },
        };
        if (/^[0-9]$/.test(k) && isFinite(v.duration)) { v.currentTime = v.duration * (+k / 10); this._showUI(); return; }
        if (map[k]) { e.preventDefault(); map[k](); this._showUI(); }
      };
      document.addEventListener('keydown', this._key);
      this._fsc = () => {
        const on = document.fullscreenElement === box;
        this.bFs.innerHTML = on ? ICON.fsx : ICON.fs;
        box.classList.toggle('fs', on);
        if (!on) { try { screen.orientation.unlock(); } catch { /* */ } }
      };
      document.addEventListener('fullscreenchange', this._fsc);
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
      if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
      if (box.requestFullscreen) {
        try {
          await box.requestFullscreen({ navigationUI: 'hide' });
          if (v.videoWidth > v.videoHeight) { try { await screen.orientation.lock('landscape'); } catch { /* */ } }
          return;
        } catch { /* جرّب طريقة الآيفون */ }
      }
      if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); // آيفون: ملء الشاشة تبع النظام
    }

    _progress() {
      const v = this.video, d = v.duration;
      if (!isFinite(d) || d <= 0) { this.time.textContent = `${fmt(v.currentTime)}`; return; }
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
    _hideUI() { if (!this._sheet && this.menu.hidden && !this.video.paused) this.box.classList.remove('ui'); }

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
    setCaptions(list) { this.captions = (list || []).filter(c => c && c.url); }
    async _pickCaption(c) {
      const v = this.video;
      this.capSel = c ? c.label : '';
      ls.set('cap', c ? c.lang : '');
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

    /* ---------- قائمة الإعدادات: بتطلع من تحت لفوق متل يوتيوب، وكل خيار بيبيّن بس إذا متوفر ---------- */
    _menu(open) {
      if (this._sheet) { this._closeSheet(); return; }
      const v = this.video;
      const fs = document.fullscreenElement === this.box;
      const ov = mk('div', 'np-sheet-ov' + (fs ? ' in-fs' : ''));
      const sh = mk('div', 'np-sheet'); sh.dir = 'rtl';
      ov.append(sh);
      ov.addEventListener('click', e => { if (e.target === ov) this._closeSheet(); });
      (fs ? this.box : document.body).append(ov);
      this._sheet = ov;
      lockScroll(true);
      // اللمس برّا القائمة ما بيحرّك الصفحة ورا
      ov.addEventListener('touchmove', e => { if (!e.target.closest('.np-sheet')) e.preventDefault(); }, { passive: false });
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
      const main = () => {
        sh.replaceChildren(mk('div', 'np-grip'));
        // الجودة
        const tracks = this._tracks();
        if (tracks.length) {
          const abr = this.shaka.getConfiguration().abr.enabled;
          const act = this.shaka.getVariantTracks().find(t => t.active);
          sh.append(row('q', 'الجودة', abr ? `تلقائي${act ? ` (${act.height}p)` : ''}` : `${act ? act.height : ''}p`, () => sub('الجودة', [
            [`تلقائي${act ? ` (${act.height}p)` : ''}`, abr, () => { this.shaka.configure({ abr: { enabled: true } }); ls.set('q', 0); }],
            ...tracks.map(t => [`${t.height}p${t.height >= 720 ? '  HD' : ''}`, !abr && act && act.height === t.height, () => {
              this.shaka.configure({ abr: { enabled: false } });
              this.shaka.selectVariantTrack(t, true, 4);
              ls.set('q', t.height); this._updQ();
            }]),
          ])));
        }
        // السرعة
        sh.append(row('sp', 'سرعة التشغيل', v.playbackRate === 1 ? 'عادي' : `${v.playbackRate}×`, () => sub('سرعة التشغيل',
          SPEEDS.map(s => [s === 1 ? 'عادي' : `${s}×`, v.playbackRate === s, () => { v.playbackRate = s; this.rate = s; }]))));
        // الترجمة (إذا في)
        if (this.captions && this.captions.length) {
          sh.append(row('cc', 'الترجمة والشرح', this.capSel || 'إيقاف', () => sub('الترجمة والشرح', [
            ['إيقاف', !this.capSel, () => this._pickCaption(null)],
            ...this.captions.map(c => [c.label, this.capSel === c.label, () => this._pickCaption(c)]),
          ])));
        }
        // المقطع الصوتي (إذا في أكتر من لغة)
        if (this.shaka && this.shaka.getAudioLanguagesAndRoles) {
          const langs = this.shaka.getAudioLanguagesAndRoles();
          if (langs.length > 1) {
            const cur = (this.shaka.getVariantTracks().find(t => t.active) || {}).language || '';
            sh.append(row('au', 'المقطع الصوتي', cur, () => sub('المقطع الصوتي',
              langs.map(l => [l.label || l.language, l.language === cur, () => this.shaka.selectAudioLanguage(l.language, l.role)]))));
          }
        }
        // مؤقت الإيقاف (من app.js)
        if (typeof setSleep === 'function' && typeof SLEEP_OPTS !== 'undefined') {
          const st = typeof sleepState !== 'undefined' ? sleepState : {};
          const val = st.endOfVideo ? 'آخر الفيديو' : st.at ? `${Math.max(1, Math.ceil((st.at - Date.now()) / 60000))} د` : 'غير مفعّل';
          sh.append(row('sl', 'مؤقّت إيقاف التشغيل', val, () => sub('مؤقّت إيقاف التشغيل',
            SLEEP_OPTS.map(([m, label]) => [label, m === 0 ? !st.at && !st.endOfVideo : m === -1 ? !!st.endOfVideo : false, () => setSleep(m, () => this)]))));
        }
        // تكرار
        sh.append(row('lp', 'تكرار الفيديو', '', r => { this.setLoop(!this.loop); r.querySelector('.np-sw').classList.toggle('on', this.loop); }, !!this.loop));
        // إعدادات عامة من app.js
        const P = window.nuvioPref;
        if (P) {
          sh.append(row('ap', 'تشغيل تلقائي', '', r => { P.set('autoplay', !P.get('autoplay')); r.querySelector('.np-sw').classList.toggle('on', P.get('autoplay')); }, !!P.get('autoplay')));
          sh.append(row('sb', 'تخطّي الدعايات جوّا الفيديو', '', r => { P.set('sb', !P.get('sb')); r.querySelector('.np-sw').classList.toggle('on', P.get('sb')); }, !!P.get('sb')));
        }
        // الفصول (إذا في)
        if (this.chapters.length) {
          const c = this._chapAt(v.currentTime || 0);
          sh.insertBefore(row('ch', 'الفصول', c && c.title ? c.title.slice(0, 22) : `${this.chapters.length}`, chSub), sh.children[1] || null);
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
      lockScroll(false);
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

  window.NuvioPlayer = NuvioPlayer;
})();
