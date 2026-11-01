/* Router, top bar, sign-in gate, event delegation and the account sheet.
   Routes live in the hash (#/draft/<planId>) so reload and the back button both work. */
KS.app = (function () {
  const { esc, icon } = KS.ui;
  const ui = { form: null, formFor: null, seen: {}, resetArmed: false };
  let current = { route: null, arg: null };

  const BACK = { plan: 'home', calc: 'plan', stock: 'calc', draft: 'stock' };

  function parse() {
    const parts = (location.hash || '').replace(/^#\/?/, '').split('/');
    return { route: parts[0] || '', arg: parts[1] ? decodeURIComponent(parts[1]) : null };
  }

  function go(route, arg, opts) {
    const h = '#/' + route + (arg ? '/' + encodeURIComponent(arg) : '');
    if (location.hash === h) return render();
    if (opts && opts.replace) { history.replaceState(null, '', h); render(); } else location.hash = h;
  }

  function topbar(route) {
    const user = KS.auth.user;
    const ready = user && KS.store.state && KS.store.state.kitchen.onboarded;
    const role = route === 'cook' ? 'cook' : 'manager';
    return '<span class="mark" aria-label="' + esc(KS.t('appName')) + '">k<span class="dot"></span>s<span class="tag">' + esc(KS.t('demoTag')) + '</span></span>' +
      (ready ? '<nav class="nav" aria-label="' + esc(KS.t('role.label')) + '">' + ['manager', 'cook'].map((r) =>
        '<button type="button" data-action="role" data-role="' + r + '"' + (r === role ? ' aria-current="page"' : '') + '>' + esc(KS.t('role.' + r)) + '</button>').join('') + '</nav>' : '') +
      '<button type="button" class="lang" data-action="lang" aria-label="' + esc(KS.t('langSwitchLabel')) + '" lang="' + (KS.lang === 'en' ? 'hi' : 'en') + '">' + esc(KS.t('langSwitch')) + '</button>' +
      (user ? '<button type="button" class="avatar-btn" data-action="account" aria-label="' + esc(KS.t('auth.account')) + '">' + KS.ui.avatar(user) + '</button>' : '');
  }

  function errorView() {
    return '<div class="empty" role="alert"><h1 class="title">' + esc(KS.t('err.title')) + '</h1><p>' + esc(KS.t('err.body')) + '</p>' +
      '<div class="sheet-actions"><button type="button" class="btn btn-primary" data-action="home">' + esc(KS.t('err.home')) + '</button></div></div>';
  }

  function render() {
    let { route, arg } = parse();
    const user = KS.auth.user;
    if (!user && route !== 'login') return go('login', null, { replace: true });
    if (user && route === 'login') return go('home', null, { replace: true });
    const state = KS.store.state;
    if (state && !state.kitchen.onboarded && route !== 'onboarding') return go('onboarding', null, { replace: true });
    if (!route) return go(state && state.role === 'cook' ? 'cook' : 'home', null, { replace: true });
    if (!KS.screens[route]) return go('home', null, { replace: true });
    if (state && route === 'cook') state.role = 'cook';
    else if (state && route !== 'onboarding') state.role = 'manager';

    const routeChanged = current.route !== route || current.arg !== arg;
    current = { route, arg };
    const screen = KS.screens[route];
    const view = document.getElementById('view');
    const dock = document.getElementById('dock');
    const active = !routeChanged && document.activeElement;
    const activeId = active && active.id;
    if (routeChanged) KS.ui.closeSheet(true);

    document.documentElement.lang = KS.lang;
    document.title = KS.t('appName') + (screen.title ? ' · ' + screen.title() : '');
    document.getElementById('topbar').innerHTML = topbar(route);

    let out;
    try {
      out = screen.render({ state, arg, ui, routeChanged });
    } catch (e) {
      console.error(e);
      out = { html: errorView(), dock: '' };
    }
    if (out.redirect) return go(out.redirect[0], out.redirect[1], { replace: true });

    const st = KS.store.status;
    const banner = !state ? ''
      : st.offline ? '<p class="note warn" role="status" style="margin-bottom:16px">' + icon('warn', 16) + '<span>' + esc(KS.t('err.offline')) + '</span></p>'
      : !st.storageOk && !KS.store.remote ? '<p class="note bad" role="alert" style="margin-bottom:16px">' + icon('warn', 16) + '<span>' + esc(KS.t('err.storage')) + '</span></p>' : '';
    view.innerHTML = banner + out.html;
    view.classList.toggle('no-dock', !out.dock);
    document.body.classList.toggle('no-dock', !out.dock);
    dock.innerHTML = out.dock || '';
    if (routeChanged) { view.classList.remove('fade-in'); void view.offsetWidth; view.classList.add('fade-in'); }

    KS.ui.animateNumbers(view);
    if (out.after) out.after();

    if (routeChanged) {
      window.scrollTo(0, 0);
      const h1 = view.querySelector('h1');
      if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    } else if (activeId) {
      const el = document.getElementById(activeId);
      if (el) {
        el.focus({ preventScroll: true });
        // Re-rendered text fields keep the caret at the end so typing continues naturally.
        if (el.tagName === 'INPUT' && /^(text|search)$/.test(el.type)) { const n = el.value.length; try { el.setSelectionRange(n, n); } catch (e) { /* unsupported */ } }
      }
    }
    KS.store.save();
  }

  async function signedIn() {
    try {
      await KS.store.load(KS.auth.user);
    } catch (e) {
      return sessionExpired();
    }
    KS.ui.forgetNumbers();
    ui.seen = {}; ui.form = null; ui.formFor = null;
    go(KS.store.state.kitchen.onboarded ? 'home' : 'onboarding');
    if (KS.store.status.corrupt) KS.ui.toast(KS.t('err.corrupt'), { icon: 'warn' });
  }

  function sessionExpired() {
    KS.auth.expired();
    KS.store.unload();
    KS.ui.closeSheet(true);
    go('login');
    KS.ui.toast(KS.t('auth.expired'), { icon: 'warn' });
  }

  /* ---------- global actions ---------- */
  const globalActions = {
    lang() {
      KS.setLang(KS.lang === 'en' ? 'hi' : 'en');
      if (KS.store.state) KS.store.state.lang = KS.lang;
      KS.store.save();
      render();
      KS.ui.renderSheet();
    },
    back() { go(BACK[current.route] || 'home', current.route === 'plan' ? null : current.arg); },
    home() { go('home'); },
    role(el) { go(el.dataset.role === 'cook' ? 'cook' : 'home'); },
    account() { openAccount(); },
  };

  function dispatch(e) {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const screen = KS.screens[current.route];
    if (el.getAttribute('aria-disabled') === 'true') {
      if (screen && screen.onBlocked) screen.onBlocked(el);
      return;
    }
    const name = el.dataset.action;
    const fn = (screen && screen.actions && screen.actions[name]) || globalActions[name];
    if (fn) fn(el, e, { state: KS.store.state, arg: current.arg, ui });
  }

  function onInput(e) {
    const el = e.target.closest('[data-input]');
    if (!el) return;
    const screen = KS.screens[current.route];
    const fn = screen && screen.inputs && screen.inputs[el.dataset.input];
    if (fn) fn(el, e, { state: KS.store.state, arg: current.arg, ui });
  }

  /* ---------- account sheet (replaces settings) ---------- */
  function openAccount() {
    const s = KS.store.state;
    const user = KS.auth.user;
    ui.resetArmed = false;
    const row = (act, label, cls) => '<button type="button" class="row" data-act="' + act + '"' + (cls ? ' style="color:var(--bad)"' : '') + '><span class="row-name">' + esc(label) + '</span>' + icon('chev', 18) + '</button>';
    KS.ui.openSheet({
      render: () =>
        '<div class="sheet-head" style="margin-bottom:12px"><h2 id="sheet-title" class="sr-only">' + esc(KS.t('auth.account')) + '</h2><span></span>' +
        '<button type="button" class="icon-btn" data-act="close" aria-label="' + esc(KS.t('close')) + '">' + icon('x', 20) + '</button></div>' +
        '<div class="account-head">' + KS.ui.avatar(user, true) + '<div class="who"><strong>' + esc(KS.auth.displayName()) + '</strong>' +
        '<span class="meta">' + esc(user.provider === 'google' ? user.email : KS.t('auth.demoMode')) + '</span>' +
        '<span class="meta" style="display:block">' + esc(KS.t(user.provider === 'google' ? 'auth.synced' : 'auth.local')) + '</span></div></div>' +
        (s ? '<div class="facts" style="grid-template-columns:2fr 1fr"><div><span class="k">' + esc(KS.t('set.kitchen')) + '</span><strong style="font-weight:600">' + esc(s.kitchen.name) + '</strong></div>' +
          '<div><span class="k">' + esc(KS.t('set.usual')) + '</span><span class="qty">' + s.kitchen.usualCovers + '</span></div></div>' +
          '<div class="list">' + row('clearToday', KS.t('set.clearToday')) + row('clearStock', KS.t('set.clearStock')) + row('replay', KS.t('set.replay')) +
          row('reset', KS.t(ui.resetArmed ? 'set.resetConfirm' : 'set.reset'), true) + '</div>' : '') +
        '<button type="button" class="btn btn-outline btn-block" data-act="signOut">' + icon('out', 20) + esc(KS.t('auth.signOut')) + '</button>' +
        '<p class="fine" style="margin-top:16px">' + esc(KS.t('set.about')) + '</p>',
      actions: {
        replay() { s.kitchen.onboarded = false; KS.store.save(); KS.ui.closeSheet(true); go('onboarding'); },
        clearToday() {
          const today = KS.date.today();
          Object.keys(s.plans).forEach((id) => { if (s.plans[id].date === today) delete s.plans[id]; });
          s.alerts = s.alerts.filter((a) => a.date !== today);
          KS.store.save(); KS.ui.closeSheet(true); go('home');
          KS.ui.toast(KS.t('set.clearedToday'), { icon: 'check' });
        },
        clearStock() {
          s.stock = {};
          KS.store.save(); KS.ui.closeSheet(true); render();
          KS.ui.toast(KS.t('set.clearedStock'), { icon: 'check' });
        },
        reset() {
          if (!ui.resetArmed) { ui.resetArmed = true; KS.ui.renderSheet(); return; }
          KS.ui.closeSheet(true);
          KS.store.reset(); KS.ui.forgetNumbers(); ui.seen = {};
          go('home');
          KS.ui.toast(KS.t('set.resetDone'), { icon: 'check' });
        },
        async signOut() {
          KS.ui.closeSheet(true);
          await KS.store.flush();
          await KS.auth.signOut();
          KS.store.unload();
          go('login');
          KS.ui.toast(KS.t('auth.signedOut'));
        },
      },
    });
  }

  async function start() {
    if (await KS.auth.init()) {
      try { await KS.store.load(KS.auth.user); } catch (e) { KS.auth.expired(); }
    }
    const view = document.getElementById('view');
    [view, document.getElementById('dock'), document.getElementById('topbar')].forEach((el) => el.addEventListener('click', dispatch));
    view.addEventListener('input', onInput);
    view.addEventListener('change', onInput);
    window.addEventListener('hashchange', render);
    // A profile photo that fails to load falls back to the initial (no inline handlers under the CSP).
    document.addEventListener('error', (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.classList.contains('avatar')) return;
      const span = document.createElement('span');
      span.className = img.className;
      span.setAttribute('aria-hidden', 'true');
      span.textContent = img.dataset.initial || 'K';
      img.replaceWith(span);
    }, true);
    render();
    if (KS.store.status.corrupt) KS.ui.toast(KS.t('err.corrupt'), { icon: 'warn' });
  }

  return { start, go, render, signedIn, sessionExpired, ui, get current() { return current; } };
})();

document.addEventListener('DOMContentLoaded', KS.app.start);
