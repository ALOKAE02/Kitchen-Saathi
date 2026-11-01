/* App state. Google accounts are stored on the server (one kitchen per account, any device) with
   a copy cached in this browser; demo mode lives only in this browser. One saved plan per
   date + meal is shared by the manager and the cook views. */
KS.store = (function () {
  const PREFIX = 'kitchen-saathi:v2:';
  let state = null;
  let key = null;
  let remote = false;
  let lastJson = '';
  let pushTimer = null;
  const status = { storageOk: true, corrupt: false, offline: false };

  function valid(s) {
    return s && s.version === 1 && s.kitchen && s.ingredients && s.dishes && s.stock && s.plans && Array.isArray(s.alerts);
  }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return undefined; }
  }

  // Throws a 401 error if the server session is gone, so the app can send you to sign-in.
  async function load(user) {
    key = PREFIX + user.id;
    remote = user.provider === 'google';
    state = null;
    lastJson = '';
    status.corrupt = false;
    status.offline = false;
    let saved = null, fromServer = false;
    if (remote) {
      try {
        saved = (await KS.auth.api('/api/kitchen')).state;
        fromServer = true;
      } catch (e) {
        if (e.status === 401) throw e;
        status.offline = true;
        saved = readCache();
      }
    } else {
      saved = readCache();
    }
    if (saved && valid(saved)) state = saved;
    else {
      if (saved !== null) status.corrupt = true;
      state = KS.seed.build(KS.date.today());
    }
    state.lang = KS.lang; // language is a device setting, chosen before sign-in
    save();
    if (remote && fromServer && !saved) push(); // first sign-in: create the kitchen on the server now
    return state;
  }

  // Send any pending change now (before signing out, or when the tab closes).
  async function flush() {
    if (!pushTimer) return;
    clearTimeout(pushTimer);
    pushTimer = null;
    await push(true);
  }

  function unload() {
    clearTimeout(pushTimer);
    pushTimer = null;
    state = null; key = null; remote = false; lastJson = '';
  }

  // Cheap to call after every render: only writes when the state actually changed.
  function save() {
    if (!state || !key) return;
    const json = JSON.stringify(state);
    if (json === lastJson) return;
    lastJson = json;
    try {
      localStorage.setItem(key, json);
      status.storageOk = true;
    } catch (e) {
      status.storageOk = false;
    }
    if (remote) {
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => { pushTimer = null; push(); }, 600);
    }
  }

  async function push(keepalive) {
    if (!remote || !lastJson) return;
    try {
      await KS.auth.api('/api/kitchen', { method: 'PUT', body: '{"state":' + lastJson + '}', keepalive: !!keepalive });
      if (status.offline) { status.offline = false; KS.app.render(); }
    } catch (e) {
      if (e.status === 401) return state && KS.app.sessionExpired();
      if (!status.offline) { status.offline = true; KS.app.render(); }
    }
  }

  // Don't lose the last half-second of edits when the tab closes.
  window.addEventListener('pagehide', () => { flush(); });

  function reset() {
    state = KS.seed.build(KS.date.today());
    state.lang = KS.lang;
    state.kitchen.onboarded = true;
    save();
  }

  const planId = (date, meal) => 'p-' + date + '-' + meal;

  function upsertPlan({ date, meal, dishes, covers }) {
    const id = planId(date, meal);
    const prev = state.plans[id];
    state.plans[id] = Object.assign({ id, createdAt: Date.now(), status: 'planned', draft: null }, prev || {}, { date, meal, dishes: dishes.slice(), covers });
    if (prev && prev.status === 'ordered') {
      const changed = prev.covers !== covers || prev.dishes.join() !== dishes.join();
      if (changed) state.plans[id].status = 'planned';
    }
    state.recent = dishes.concat(state.recent.filter((d) => !dishes.includes(d))).slice(0, 6);
    save();
    return state.plans[id];
  }

  function plansOn(date) {
    return KS.MEALS.map((m) => state.plans[planId(date, m)]).filter(Boolean);
  }

  function addAlert(plan, ing) {
    const a = { id: 'a-' + Date.now() + '-' + ing, planId: plan.id, ing, meal: plan.meal, date: plan.date, at: new Date().toISOString(), done: false };
    state.alerts.unshift(a);
    save();
    return a;
  }

  return {
    load, unload, flush, save, reset, status, planId, upsertPlan, plansOn, addAlert,
    get state() { return state; },
    get remote() { return remote; },
  };
})();
