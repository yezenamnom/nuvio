/* Nuvio — استيراد سجل يوتيوب من Google Takeout.
   بيقبل ملف الـ zip متل ما بينزل، أو watch-history / search-history بصيغة JSON أو HTML.
   كل شي بينقرا جوّا المتصفح وبينحفظ على جهازك بس — ما في شي بيطلع لأي سيرفر. */
'use strict';

(function () {
  const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  // الكلمة اللي بتحطها غوغل قبل العنوان حسب لغة الحساب
  const PREFIXES = [/^Watched\s+/i, /^تمت مشاهدة\s+/, /^شاهدت\s+/, /^مشاهدة\s+/, /^Visto\s+/i, /^Vu\s+/i, /^Regardé\s+/i, /^Assistiu a\s+/i, /^Guardato\s+/i, /^Angesehen:\s*/i, /^İzlendi:?\s*/i];
  const SUFFIXES = [/\s+angesehen$/i, /\s+izlendi$/i, /\s+を視聴しました$/];
  const SEARCH_PREFIXES = [/^Searched for\s+/i, /^تم البحث عن\s+/, /^بحثت عن\s+/, /^Gesucht nach:?\s*/i, /^Buscaste\s+/i, /^Recherche\s*:?\s*/i];

  const vidId = url => { try { const u = new URL(url); return u.searchParams.get('v') || (u.hostname.endsWith('youtu.be') ? u.pathname.slice(1, 12) : ''); } catch { return ''; } };
  const chId = url => { const m = (url || '').match(/\/channel\/(UC[\w-]{22})/); return m ? m[1] : ''; };
  const cleanTitle = s => { let t = (s || '').trim(); for (const p of PREFIXES) t = t.replace(p, ''); for (const p of SUFFIXES) t = t.replace(p, ''); return t.trim(); };
  const searchQ = url => { try { return new URL(url).searchParams.get('search_query') || ''; } catch { return ''; } };

  function fromJson(arr, kind) {
    const out = [];
    if (!Array.isArray(arr)) return out;
    for (const e of arr) {
      if (!e || !e.titleUrl) continue;
      if ((e.details || []).some(d => /Google Ads|إعلانات Google/i.test(d.name || ''))) continue; // إعلانات، منتجاهلها
      const at = Date.parse(e.time) || 0;
      if (kind === 'search') {
        let q = searchQ(e.titleUrl);
        if (!q) { q = e.title || ''; for (const p of SEARCH_PREFIXES) q = q.replace(p, ''); }
        if (q) out.push({ q: q.trim(), at });
      } else {
        const id = vidId(e.titleUrl);
        if (!id || id.length !== 11) continue;
        const sub = (e.subtitles || [])[0] || {};
        out.push({ id, title: cleanTitle(e.title) || id, author: sub.name || '', authorId: chId(sub.url), at });
      }
    }
    return out;
  }

  function fromHtml(text, kind) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const out = [];
    const cells = doc.querySelectorAll('.content-cell');
    for (const c of cells) {
      const links = [...c.querySelectorAll('a')];
      if (!links.length) continue;
      if (/Google Ads|إعلانات Google/i.test(c.parentElement ? c.parentElement.textContent : '')) continue;
      // التاريخ آخر سطر بالخلية
      const lines = c.innerText ? c.innerText.split('\n') : c.textContent.split('\n');
      const at = Date.parse((lines[lines.length - 1] || '').replace(/ /g, ' ')) || 0;
      if (kind === 'search') {
        const q = searchQ(links[0].href) || links[0].textContent;
        if (q) out.push({ q: q.trim(), at });
      } else {
        const id = vidId(links[0].href);
        if (!id || id.length !== 11) continue;
        const ch = links.find(a => /\/channel\//.test(a.href));
        out.push({ id, title: cleanTitle(links[0].textContent) || id, author: ch ? ch.textContent.trim() : '', authorId: ch ? chId(ch.href) : '', at });
      }
    }
    return out;
  }

  function parseText(name, text) {
    const kind = /search-history/i.test(name) ? 'search' : /watch-history/i.test(name) ? 'watch' : null;
    if (!kind) return null;
    if (/\.json$/i.test(name)) { try { return { kind, items: fromJson(JSON.parse(text), kind) }; } catch { return { kind, items: [] }; } }
    return { kind, items: fromHtml(text, kind) };
  }

  function loadJsZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise((ok, bad) => {
      const s = document.createElement('script');
      s.src = JSZIP_URL; s.onload = () => ok(window.JSZip); s.onerror = () => bad(new Error('ما قدرت حمّل قارئ الـ zip'));
      document.head.append(s);
    });
  }

  /* بيرجّع { watch: [...], search: [...] } من ملف أو أكتر */
  async function readFiles(files) {
    const res = { watch: [], search: [] };
    for (const f of files) {
      if (/\.zip$/i.test(f.name) || f.type === 'application/zip') {
        const JSZip = await loadJsZip();
        const zip = await JSZip.loadAsync(f);
        const entries = Object.values(zip.files).filter(z => !z.dir && /(watch|search)-history\.(json|html)$/i.test(z.name));
        for (const z of entries) {
          const r = parseText(z.name, await z.async('string'));
          if (r) res[r.kind].push(...r.items);
        }
      } else {
        const r = parseText(f.name, await f.text());
        if (r) res[r.kind].push(...r.items);
      }
    }
    return res;
  }

  window.NuvioImport = { readFiles, _parseText: parseText };
})();
