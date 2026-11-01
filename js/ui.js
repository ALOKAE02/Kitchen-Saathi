/* Shared UI: icons, escaping, quantity animation, toast, bottom sheet, flow header, squiggle. */
KS.ui = (function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const P = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    chev: '<path d="M9 5l7 7-7 7"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l7-7"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    warn: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
    empty: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"/>',
    scale: '<path d="M12 4v16M6 20h12M4 8h16M7 8l-3 6a3 3 0 006 0zM17 8l-3 6a3 3 0 006 0z"/>',
    chat: '<path d="M4 19.5l1.3-3.8A8 8 0 1112 20a8 8 0 01-3.9-1z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.6-2-1-1 .8a3.5 3.5 0 01-1.7-1.7l.8-1-1-2z" fill="currentColor" stroke="none"/>',
    copy: '<rect x="8" y="8" width="11.5" height="11.5" rx="2"/><path d="M15.5 8V6a1.5 1.5 0 00-1.5-1.5H6A1.5 1.5 0 004.5 6v8A1.5 1.5 0 006 15.5h2"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 004 0"/>',
    cal: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    out: '<path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M10 16l-4-4 4-4M6 12h10"/>',
  };
  const icon = (name, size, extra) =>
    '<svg width="' + (size || 22) + '" height="' + (size || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' + (extra || '') + '>' + (P[name] || '') + '</svg>';

  // Freshness / stock state → icon + word + colour class.
  const STATUS = { fresh: ['ok', 'leaf'], soon: ['warn', 'clock'], stale: ['bad', 'warn'], none: ['none', 'empty'], units: ['warn', 'scale'] };
  const status = (key, extra) => '<span class="status ' + STATUS[key][0] + '">' + icon(STATUS[key][1], 14) + esc(KS.t('fresh.' + key)) + (extra ? ' · ' + esc(extra) : '') + '</span>';

  // The hand-drawn sun-yellow underline from the brand. `draw` animates it in once.
  const squiggle = (draw) =>
    '<svg class="squiggle' + (draw ? ' draw' : '') + '" viewBox="0 0 200 18" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="M3 11c12-8 20 6 32-1s20-7 30 0 20 7 32 0 20-8 32-1 20 7 32 0 18-6 34-1"/></svg>';
  const sparks = '<svg class="sparks" viewBox="0 0 28 28" aria-hidden="true"><path d="M8 14L4 26M16 12l8-10M18 20l8-3"/></svg>';

  function avatar(user, lg) {
    const cls = 'avatar' + (lg ? ' lg' : '');
    const initial = esc((KS.auth.displayName() || 'K').trim().charAt(0).toUpperCase());
    if (user && user.picture) return '<img class="' + cls + '" src="' + esc(user.picture) + '" alt="" referrerpolicy="no-referrer" data-initial="' + initial + '">';
    return '<span class="' + cls + '" aria-hidden="true">' + initial + '</span>';
  }

  /* ---------- live quantity animation ---------- */
  const lastValues = new Map();
  function animateNumbers(root) {
    root.querySelectorAll('[data-num]').forEach((el) => {
      const key = el.dataset.num;
      const to = parseFloat(el.dataset.raw);
      const unit = el.dataset.unit;
      const from = lastValues.get(key);
      lastValues.set(key, to);
      if (from == null || Math.abs(from - to) < 1e-9) return;
      el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
      if (reduced() || document.hidden) return;
      // Land on the exact value even if animation frames are throttled.
      setTimeout(() => { if (el.isConnected && el.dataset.raw == String(to)) el.innerHTML = KS.fmt.inner(to, unit); }, 460);
      const start = performance.now(), dur = 380;
      const tick = (now) => {
        const p = Math.min(1, (now - start) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        if (!el.isConnected) return;
        el.innerHTML = KS.fmt.inner(from + (to - from) * e, unit);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }
  function forgetNumbers() { lastValues.clear(); }

  /* ---------- toast ---------- */
  let toastTimer = null;
  function toast(msg, opts) {
    opts = opts || {};
    const wrap = document.getElementById('toast');
    clearTimeout(toastTimer);
    wrap.innerHTML = '<div class="toast">' +
      '<span class="msg">' + (opts.icon ? icon(opts.icon, 18) : '') + '<span>' + esc(msg) + '</span></span>' +
      (opts.action ? '<button type="button" id="toast-action">' + esc(opts.action.label) + '</button>' : '') + '</div>';
    if (opts.action) document.getElementById('toast-action').onclick = () => { wrap.innerHTML = ''; opts.action.fn(); };
    toastTimer = setTimeout(() => { wrap.innerHTML = ''; }, opts.ms || (opts.action ? 6000 : 3000));
  }

  /* ---------- bottom sheet ---------- */
  let sheetState = null;
  function openSheet(cfg) {
    closeSheet(true);
    const root = document.getElementById('sheet-root');
    sheetState = { cfg, returnFocus: document.activeElement };
    root.innerHTML = '<div class="sheet-backdrop" data-close></div>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1"><div class="grab"></div><div id="sheet-body"></div></div>';
    renderSheet();
    const sheet = root.querySelector('.sheet');
    root.querySelector('[data-close]').onclick = () => closeSheet();
    sheet.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || !sheet.contains(el)) return;
      if (el.dataset.act === 'close') return closeSheet();
      cfg.actions && cfg.actions[el.dataset.act] && cfg.actions[el.dataset.act](el, e);
    });
    sheet.addEventListener('input', (e) => {
      const el = e.target.closest('[data-in]');
      if (el && cfg.inputs && cfg.inputs[el.dataset.in]) cfg.inputs[el.dataset.in](el, e);
    });
    document.getElementById('app').setAttribute('aria-hidden', 'true');
    document.addEventListener('keydown', sheetKeys);
    const first = cfg.focus && sheet.querySelector(cfg.focus);
    (first || sheet).focus();
  }
  function renderSheet() {
    if (!sheetState) return;
    const body = document.getElementById('sheet-body');
    const active = document.activeElement;
    const activeId = active && active.id;
    body.innerHTML = sheetState.cfg.render();
    animateNumbers(body);
    if (activeId) {
      const el = document.getElementById(activeId);
      if (el) {
        el.focus({ preventScroll: true });
        if (el.tagName === 'INPUT') { const n = el.value.length; try { el.setSelectionRange(n, n); } catch (e) { /* unsupported */ } }
      }
    }
  }
  function closeSheet(silent) {
    if (!sheetState) return;
    const { returnFocus, cfg } = sheetState;
    sheetState = null;
    document.getElementById('sheet-root').innerHTML = '';
    document.getElementById('app').removeAttribute('aria-hidden');
    document.removeEventListener('keydown', sheetKeys);
    if (!silent) {
      cfg.onClose && cfg.onClose();
      if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
    }
  }
  function sheetKeys(e) {
    if (e.key === 'Escape') return closeSheet();
    if (e.key !== 'Tab') return;
    const sheet = document.querySelector('.sheet');
    const f = sheet.querySelectorAll('button, input, textarea, [href], [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  const sheetHead = (title, sub) =>
    '<div class="sheet-head"><div><h2 id="sheet-title">' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' +
    '<button type="button" class="icon-btn" data-act="close" aria-label="' + esc(KS.t('close')) + '">' + icon('x', 20) + '</button></div>';

  /* ---------- flow header: back + a four-segment progress line ---------- */
  function flowbar(n) {
    return '<nav class="flow" aria-label="' + esc(KS.t('step', { n })) + '">' +
      '<button type="button" class="icon-btn" data-action="back" aria-label="' + esc(KS.t('back')) + '">' + icon('back', 20) + '</button>' +
      '<div class="progress" aria-hidden="true">' + [1, 2, 3, 4].map((i) => '<span class="' + (i <= n ? 'on' : '') + '"></span>').join('') + '</div>' +
      '<span class="n">' + n + '/4</span></nav>';
  }

  function skeletonList(rows) {
    let html = '<div class="list" aria-hidden="true">';
    for (let i = 0; i < rows; i++) html += '<div class="skel-row"><div class="skel" style="height:16px;width:' + (40 + ((i * 17) % 35)) + '%"></div><div class="skel" style="height:22px;width:64px"></div></div>';
    return html + '</div>';
  }

  /* Covers stepper + presets, shared by onboarding and planning. */
  function coversInput(value, usual) {
    const presets = [30, 50, 80, 100];
    if (usual && !presets.includes(usual)) presets.push(usual), presets.sort((a, b) => a - b);
    return '<div class="covers" role="group" aria-label="' + esc(KS.t('plan.covers')) + '">' +
      '<button type="button" id="cov-minus" data-action="coversStep" data-d="-1" aria-label="' + esc(KS.t('plan.coversLess')) + '">' + icon('minus', 24) + '</button>' +
      '<input id="cov-input" data-input="covers" inputmode="numeric" pattern="[0-9]*" maxlength="4" value="' + value + '" aria-label="' + esc(KS.t('plan.covers')) + '" autocomplete="off">' +
      '<button type="button" id="cov-plus" data-action="coversStep" data-d="1" aria-label="' + esc(KS.t('plan.coversMore')) + '">' + icon('plus', 24) + '</button></div>' +
      '<div class="chips covers-presets">' + presets.map((n) =>
        '<button type="button" class="chip num" id="cov-p' + n + '" data-action="coversSet" data-v="' + n + '" aria-pressed="' + (n === value) + '"' +
        (n === usual ? ' aria-label="' + n + ' (' + esc(KS.t('plan.usual')) + ')"' : '') + '>' + n + '</button>').join('') + '</div>';
  }

  return { esc, icon, status, squiggle, sparks, avatar, animateNumbers, forgetNumbers, toast, openSheet, renderSheet, closeSheet, sheetHead, flowbar, skeletonList, coversInput, reduced };
})();

KS.screens = {};
