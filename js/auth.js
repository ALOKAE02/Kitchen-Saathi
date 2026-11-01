/* Sign-in. Google's button hands the browser an ID token; the server (server.py) checks its
   signature, issuer, audience and expiry, then starts a session in an HttpOnly cookie.
   The browser never decides who you are. Demo mode stays local to this device. */
KS.auth = (function () {
  const DEMO_KEY = 'kitchen-saathi:session';
  let user = null;
  let server = { available: false, clientId: '' };
  let gis = 'idle'; // idle | loading | ready | failed
  let waiting = null;
  let busy = false;

  async function api(path, opts) {
    const res = await fetch(path, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, opts));
    let body = null;
    try { body = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
      const err = new Error((body && body.error) || 'HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  // Ask the server for its settings and for an existing session.
  async function init() {
    try {
      const cfg = await api('/api/config');
      server = { available: true, clientId: cfg.googleClientId || '' };
    } catch (e) {
      server = { available: false, clientId: '' };
    }
    if (server.available) {
      try { const me = (await api('/api/me')).user; user = me ? Object.assign({ provider: 'google' }, me) : null; } catch (e) { user = null; }
    }
    if (!user) {
      try {
        const saved = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null');
        if (saved && saved.provider === 'demo') user = saved;
        else localStorage.removeItem(DEMO_KEY);
      } catch (e) { user = null; }
    }
    return user;
  }

  async function onCredential(resp) {
    busy = true;
    KS.app.render();
    try {
      const out = await api('/api/auth/google', { method: 'POST', body: JSON.stringify({ credential: resp.credential }) });
      user = Object.assign({ provider: 'google' }, out.user);
      try { localStorage.removeItem(DEMO_KEY); } catch (e) { /* storage blocked */ }
      busy = false;
      await KS.app.signedIn();
    } catch (e) {
      busy = false;
      KS.app.render();
      KS.ui.toast(KS.t(e.status === 503 ? 'auth.googleDown' : 'auth.failed'), { icon: 'warn' });
    }
  }

  function loadGis() {
    if (gis !== 'idle' || !server.clientId) return;
    gis = 'loading';
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      try {
        google.accounts.id.initialize({ client_id: server.clientId, callback: onCredential, ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true });
        gis = 'ready';
      } catch (e) { gis = 'failed'; }
      if (waiting) renderButton(waiting);
      if (gis === 'failed') KS.app.render();
    };
    s.onerror = () => { gis = 'failed'; KS.app.render(); };
    document.head.appendChild(s);
  }

  function renderButton(el) {
    if (gis !== 'ready') { waiting = el; loadGis(); return; }
    waiting = null;
    if (!el || !el.isConnected) return;
    el.innerHTML = '';
    google.accounts.id.renderButton(el, {
      type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with',
      logo_alignment: 'center', width: Math.max(220, Math.min(400, el.clientWidth || 320)), locale: KS.lang === 'hi' ? 'hi' : 'en',
    });
  }

  function signInDemo() {
    user = { id: 'demo', name: '', email: '', picture: '', provider: 'demo' };
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(user)); } catch (e) { /* storage blocked */ }
    KS.app.signedIn();
  }

  async function signOut() {
    if (user && user.provider === 'google') {
      try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch (e) { /* session already gone */ }
      if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
    }
    try { localStorage.removeItem(DEMO_KEY); } catch (e) { /* storage blocked */ }
    user = null;
  }

  // The server said our session is gone (expired or signed out elsewhere).
  function expired() { user = null; }

  return {
    init, api, renderButton, signInDemo, signOut, expired,
    get user() { return user; },
    get serverAvailable() { return server.available; },
    get configured() { return !!server.clientId; },
    get failed() { return gis === 'failed'; },
    get busy() { return busy; },
    displayName() { return !user ? '' : user.provider === 'demo' ? KS.t('auth.demoName') : user.name; },
  };
})();
