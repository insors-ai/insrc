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

  /* ---- overflow nav (priority "⋯ more" menu) --------------------------- */
  /* Keep the header on ONE line: links that don't fit collapse into a
     dropdown. Progressive enhancement — adds .nav-enhanced (which flips the
     nav to nowrap in CSS); without JS the nav just wraps. */
  function initNavOverflow() {
    const nav = document.querySelector('.nav');
    const inner = document.querySelector('.nav-inner');
    const links = document.querySelector('.nav-links');
    const brand = inner && inner.querySelector('.brand');
    const themeBtn = inner && inner.querySelector('.theme-btn');
    if (!nav || !inner || !links || !brand || !themeBtn) return;

    nav.classList.add('nav-enhanced');

    const more = document.createElement('div');
    more.className = 'nav-more'; more.hidden = true;
    const btn = document.createElement('button');
    btn.className = 'nav-more-btn'; btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'more pages');
    btn.textContent = '⋯ more';
    const menu = document.createElement('div');
    menu.className = 'nav-menu'; menu.hidden = true;
    menu.setAttribute('role', 'menu');
    more.append(btn, menu);
    links.appendChild(more);

    const closeMenu = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    const openMenu = () => { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); if (menu.hidden) openMenu(); else closeMenu(); });
    document.addEventListener('click', (e) => { if (!more.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

    function layout() {
      // 1. Reset: pull every link back onto the bar, hide the dropdown.
      while (menu.firstChild) links.insertBefore(menu.firstChild, more);
      more.hidden = true; closeMenu(); btn.classList.remove('active');

      // 2. Width available for the links group (between brand and theme button).
      const cs = getComputedStyle(inner);
      const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const gap = parseFloat(cs.columnGap || cs.gap) || 18;
      const avail = inner.clientWidth - pad - brand.offsetWidth - themeBtn.offsetWidth - 2 * gap;

      // 3. Everything fits (without the "more" button) → no dropdown.
      if (links.scrollWidth <= avail) return;

      // 4. Overflow: reveal the dropdown, then move trailing links into it
      //    (from the end, preserving order) until the row fits.
      more.hidden = false;
      let guard = 0;
      const bar = () => Array.prototype.filter.call(links.children, (el) => el.tagName === 'A');
      while (links.scrollWidth > avail && bar().length > 0 && guard++ < 50) {
        const items = bar();
        menu.insertBefore(items[items.length - 1], menu.firstChild);
      }

      // 5. If the active page collapsed into the menu, flag the "more" button.
      if (menu.querySelector('a.active')) btn.classList.add('active');
    }

    let raf = 0;
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); };
    layout();
    window.addEventListener('resize', schedule);
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
    initTheme(); initNav(); initNavOverflow(); initCopy(); initAnchors(); initType();
  });
})();
