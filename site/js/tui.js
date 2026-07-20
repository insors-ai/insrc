/* insrc TUI site — progressive enhancement only. The site is fully readable
   with JS disabled; this adds the theme toggle, active-nav marking, code
   copy buttons, and a hero type-in that respects prefers-reduced-motion. */
(() => {
  'use strict';

  /* ---- theme (persisted) ------------------------------------------------ */
  const KEY = 'insrc-theme';
  const root = document.documentElement;
  const stored = (() => { try { return localStorage.getItem(KEY); } catch { return null; } })();
  if (stored === 'light' || stored === 'dark') root.setAttribute('data-theme', stored);

  function currentTheme() {
    return root.getAttribute('data-theme')
      || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  }
  function paintToggle(btn) { btn.textContent = currentTheme() === 'dark' ? '◐ light' : '◑ dark'; }

  function initTheme() {
    const btn = document.querySelector('.theme-btn');
    if (!btn) return;
    paintToggle(btn);
    btn.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
      paintToggle(btn);
    });
  }

  /* ---- active nav ------------------------------------------------------- */
  function initNav() {
    const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    document.querySelectorAll('.nav-links a').forEach((a) => {
      const href = (a.getAttribute('href') || '').toLowerCase();
      if (href === here || (here === 'index.html' && href === 'index.html')) a.classList.add('active');
    });
  }

  /* ---- copy buttons on code blocks ------------------------------------- */
  function initCopy() {
    document.querySelectorAll('.copy').forEach((btn) => {
      btn.addEventListener('click', () => {
        const block = btn.closest('.code');
        const pre = block && block.querySelector('pre');
        if (!pre) return;
        const text = pre.innerText.replace(/ /g, ' ');
        const done = () => { const o = btn.textContent; btn.textContent = 'copied'; btn.classList.add('done');
          setTimeout(() => { btn.textContent = o; btn.classList.remove('done'); }, 1300); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(() => {});
        } else {
          const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
          ta.select(); try { document.execCommand('copy'); done(); } catch { /* ignore */ } ta.remove();
        }
      });
    });
  }

  /* ---- heading anchors -------------------------------------------------- */
  function initAnchors() {
    document.querySelectorAll('main h2[id], main h3[id]').forEach((h) => {
      const a = document.createElement('a');
      a.href = '#' + h.id; a.className = 'anchor'; a.textContent = '#'; a.setAttribute('aria-hidden', 'true');
      h.appendChild(a);
    });
  }

  /* ---- hero type-in ----------------------------------------------------- */
  function initType() {
    const el = document.querySelector('[data-type]');
    if (!el) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const full = el.getAttribute('data-type') || el.textContent;
    if (reduce) { el.textContent = full; return; }
    el.textContent = '';
    let i = 0;
    (function tick() {
      if (i <= full.length) { el.textContent = full.slice(0, i); i += 1; setTimeout(tick, 26); }
    })();
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTheme(); initNav(); initCopy(); initAnchors(); initType();
  });
})();
