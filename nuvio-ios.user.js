// ==UserScript==
// @name         Nuvio — صوت بالخلفية (آيفون)
// @namespace    https://nuvio.glanzstar.de
// @version      1.0.0
// @description  بيخلّي Nuvio يجيب صوت الفيديو من تلفونك مباشرة، لحتى يضل شغّال لمّا تسكّر الشاشة أو تطلع من سفاري.
// @match        https://nuvio.glanzstar.de/*
// @match        https://yezenamnom.github.io/nuvio/*
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @connect      www.youtube.com
// @run-at       document-start
// @inject-into  content
// @updateURL    https://nuvio.glanzstar.de/nuvio-ios.user.js
// @downloadURL  https://nuvio.glanzstar.de/nuvio-ios.user.js
// ==/UserScript==

/* شو بيعمل:
   - بيحط علامة (data-nuvio-gm) على صفحة Nuvio، فالموقع بيعرف إنو السكربت موجود.
   - لمّا الموقع بدو معلومات تشغيل فيديو من يوتيوب (طلبين بس: player و visitor_id)، السكربت بيعمل الطلب
     من تلفونك نفسو (تطبيق Userscripts بيسمحلو، والصفحة لحالها ما بتقدر)، وبيرجّع الجواب للموقع.
   - الموقع بياخد منو رابط صوت الفيديو، وبيشغّلو لمّا تسكّر الشاشة — من نت تلفونك، بلا سيرفرنا.
   ما بيقرا شي من الصفحة، ما بيحفظ شي، وما بيبعت شي لحدا غير يوتيوب. */
(function () {
  'use strict';
  const ORIGINS = ['https://nuvio.glanzstar.de', 'https://yezenamnom.github.io'];
  const EPS = ['player', 'visitor_id']; // بس هدول
  const gmx = (typeof GM !== 'undefined' && GM && GM.xmlHttpRequest) ? o => GM.xmlHttpRequest(o)
    : (typeof GM_xmlhttpRequest === 'function' ? o => GM_xmlhttpRequest(o) : null);
  if (!gmx) return;
  // العلامة عالصفحة (بـ document-start أحياناً الصفحة لسّا ما انخلقت: منستنّاها)
  const mark = () => { const h = document.documentElement; if (!h) return false; h.setAttribute('data-nuvio-gm', '1.0.0'); return true; };
  if (!mark()) { const mo = new MutationObserver(() => { if (mark()) mo.disconnect(); }); mo.observe(document, { childList: true }); }
  window.addEventListener('message', e => {
    if (ORIGINS.indexOf(e.origin) < 0) return;
    const m = e.data;
    if (!m || m.nuvioGM !== 1 || typeof m.rid !== 'string' || EPS.indexOf(m.ep) < 0) return;
    const reply = (ok, data) => window.postMessage({ nuvioGMr: m.rid, ok: ok, data: data }, e.origin);
    try {
      gmx({
        method: 'POST',
        url: 'https://www.youtube.com/youtubei/v1/' + m.ep + '?prettyPrint=false',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(m.body || {}),
        anonymous: true,
        timeout: 15000,
        onload: r => (r.status >= 200 && r.status < 300 ? reply(true, r.responseText) : reply(false, 'HTTP ' + r.status)),
        onerror: () => reply(false, 'network'),
        ontimeout: () => reply(false, 'timeout'),
      });
    } catch (err) { reply(false, String(err && err.message || err)); }
  });
})();
