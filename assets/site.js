/* Portfolio chrome + tiny helpers shared by every top-level page. No dependencies. */
(function () {
  const PAGES = [['index.html', 'Home'], ['tech.html', 'Tech Stack'], ['skills.html', 'Skills'], ['blog.html', 'Blog']];
  const here = (location.pathname.split('/').pop() || 'index.html');
  const P = window.SITE_PROFILE || {};
  const nav = document.getElementById('site-nav');
  if (nav) nav.outerHTML = `<header class="site-nav"><div class="wrap">
    <a class="brand" href="index.html" aria-label="Home"><i>◆</i></a>
    <nav aria-label="Main">${PAGES.map(([h, t]) => `<a href="${h}"${h === here ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav></div></header>`;
  const foot = document.getElementById('site-foot');
  if (foot) foot.outerHTML = `<footer class="foot"><div class="wrap">© ${new Date().getFullYear()} ${P.name || ''} · everything runs client-side.</div></footer>`;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  /* Highlight query tokens inside already-plain text. */
  function hi(text, toks) {
    const t = String(text || ''); if (!toks.length) return esc(t);
    const n = norm(t); const hit = new Array(t.length).fill(false);
    for (const k of toks) { let i = -1; while ((i = n.indexOf(k, i + 1)) !== -1) for (let j = i; j < i + k.length; j++) hit[j] = true; }
    let out = '', open = false;
    for (let i = 0; i < t.length; i++) { if (hit[i] !== open) { out += open ? '</mark>' : '<mark>'; open = hit[i]; } out += esc(t[i]); }
    return out + (open ? '</mark>' : '');
  }
  /* AND-search over weighted fields. Returns [{item, score}] best first. */
  function search(items, q, fields) {
    const toks = norm(q).split(/\s+/).filter(Boolean);
    if (!toks.length) return items.map(item => ({ item, score: 0 }));
    const out = [];
    for (const item of items) {
      let score = 0, ok = true;
      for (const k of toks) {
        let best = 0;
        for (const [f, w] of fields) {
          const v = norm([].concat(item[f] || []).join(' '));
          const i = v.indexOf(k);
          if (i !== -1) best = Math.max(best, w * (i === 0 || v[i - 1] === ' ' ? 2 : 1));
        }
        if (!best) { ok = false; break; } score += best;
      }
      if (ok) out.push({ item, score });
    }
    return out.sort((a, b) => b.score - a.score);
  }
  function bindSearch(input, onChange) {
    const u = new URL(location.href); const init = u.searchParams.get('q'); if (init) input.value = init;
    let t; input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { const x = new URL(location.href); input.value ? x.searchParams.set('q', input.value) : x.searchParams.delete('q'); history.replaceState(null, '', x); onChange(); }, 80); });
    addEventListener('keydown', e => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName)) { e.preventDefault(); input.focus(); input.select(); } else if (e.key === 'Escape' && document.activeElement === input) { input.value = ''; input.dispatchEvent(new Event('input')); input.blur(); } });
  }

  const ICONS = {
    github: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
    email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m3.5 7 8.5 6.5L20.5 7"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>'
  };
  const LABELS = { github: 'GitHub', linkedin: 'LinkedIn', email: 'Email' };
  /* round icon buttons for the profile links (cv is rendered separately as a button) */
  const socials = () => Object.entries(P.links || {}).filter(([k]) => ICONS[k] && k !== 'download')
    .map(([k, u]) => `<a class="ico-btn" href="${esc(u)}" aria-label="${LABELS[k] || k}" title="${LABELS[k] || k}"${k === 'email' ? '' : ' target="_blank" rel="noopener"'}>${ICONS[k]}</a>`).join('');
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  window.Site = { esc, norm, hi, search, bindSearch, ICON, ICONS, socials };
})();
