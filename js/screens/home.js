/* Today: one line per meal, cook alerts on top, one button. */
KS.screens.home = (function () {
  const { esc, icon } = KS.ui;

  function alertsHtml(state) {
    return state.alerts.filter((a) => !a.done).slice(0, 3).map((a) =>
      '<div class="alert" role="alert"><span class="dot" aria-hidden="true"></span>' +
      '<p>' + esc(KS.t('alert.missing', { item: KS.nm(state.ingredients[a.ing]), meal: KS.t('meal.' + a.meal) })) + '</p>' +
      '<button type="button" class="btn btn-primary btn-sm" data-action="alertAdd" data-id="' + a.id + '">' + esc(KS.t('alert.add')) + '</button>' +
      '<button type="button" class="x" data-action="alertDone" data-id="' + a.id + '" aria-label="' + esc(KS.t('alert.dismiss')) + '">' + icon('x', 18) + '</button></div>').join('');
  }

  function mealRow(state, date, meal) {
    const plan = state.plans[KS.store.planId(date, meal)];
    if (!plan) {
      return '<button type="button" class="row" data-action="planMeal" data-meal="' + meal + '" data-date="' + date + '">' +
        '<span class="row-main"><span class="row-name">' + esc(KS.t('meal.' + meal)) + '</span><span class="row-meta">' + esc(KS.t('home.notPlanned')) + '</span></span>' +
        '<span class="row-end"><span class="btn-text" style="text-decoration:none">' + icon('plus', 18) + esc(KS.t('home.plan')) + '</span></span></button>';
    }
    const ordered = plan.status === 'ordered';
    return '<button type="button" class="row" data-action="openOrder" data-id="' + plan.id + '">' +
      '<span class="row-main"><span class="row-name">' + esc(KS.t('meal.' + meal)) + '</span>' +
      '<span class="row-meta">' + esc(plan.dishes.map((d) => KS.nm(state.dishes[d])).join(', ') + ' · ' + plan.covers) + '</span></span>' +
      '<span class="row-end"><span class="status ' + (ordered ? 'ok' : 'warn') + '">' + icon(ordered ? 'check' : 'clock', 14) + esc(KS.t(ordered ? 'home.ordered' : 'home.planned')) + '</span>' + icon('chev', 18) + '</span></button>';
  }

  function render({ state }) {
    const today = KS.date.today();
    const upcoming = Object.values(state.plans).filter((p) => p.date > today)
      .sort((a, b) => (a.date + KS.MEALS.indexOf(a.meal)).localeCompare(b.date + KS.MEALS.indexOf(b.meal))).slice(0, 4);

    const html = alertsHtml(state) +
      '<header class="head"><p class="kicker">' + esc(KS.date.long(today)) + '</p><h1 class="display">' + esc(KS.t('home.title')) + '</h1>' +
      '<p class="sub meta">' + esc(state.kitchen.name) + '</p></header>' +
      '<div class="list">' + KS.MEALS.map((m) => mealRow(state, today, m)).join('') + '</div>' +
      (upcoming.length ? '<section class="section"><h2 class="h2" style="margin-bottom:12px">' + esc(KS.t('home.upcoming')) + '</h2><div class="list">' +
        upcoming.map((p) => '<button type="button" class="row" data-action="openOrder" data-id="' + p.id + '"><span class="row-main"><span class="row-name">' +
          esc(KS.date.fmt(p.date, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + KS.t('meal.' + p.meal)) + '</span><span class="row-meta">' +
          esc(p.dishes.map((d) => KS.nm(state.dishes[d])).join(', ') + ' · ' + p.covers) + '</span></span>' + icon('chev', 18) + '</button>').join('') + '</div></section>' : '');

    const dock = '<button type="button" class="btn btn-primary btn-block" data-action="planMeal">' + esc(KS.t('home.cta')) + icon('arrow', 20) + '</button>';
    return { html, dock };
  }

  function addToOrder(state, alert) {
    const plan = state.plans[alert.planId];
    if (!plan) return;
    KS.calc.syncDraft(state, plan, KS.date.today());
    const need = KS.calc.needs(state, plan).find((n) => n.ing === alert.ing);
    const ing = state.ingredients[alert.ing];
    const step = KS.unitsMath.isCount(ing.unit) ? 1 : ing.buyStep || 0.25;
    const qty = KS.calc.roundUp(need ? need.total : step, step);
    const existing = plan.draft.items.find((i) => i.ing === alert.ing);
    // The cook says it's missing, so order the whole need, not need minus "stock".
    if (existing) { existing.qty = Math.max(existing.qty, qty); existing.edited = existing.source === 'auto' && existing.qty !== existing.auto; }
    else plan.draft.items.push({ key: alert.ing, ing: alert.ing, unit: ing.unit, qty, auto: 0, source: 'added', edited: false });
    if (plan.status === 'ordered') plan.status = 'planned';
  }

  return {
    title: () => KS.t('home.title'),
    render,
    actions: {
      planMeal(el, e, { ui }) {
        ui.form = { date: el.dataset.date || KS.date.today(), meal: el.dataset.meal || null, dishes: [], covers: KS.store.state.kitchen.usualCovers, q: '' };
        ui.formFor = 'new';
        KS.app.go('plan');
      },
      openOrder(el) { KS.app.go('draft', el.dataset.id); },
      alertAdd(el, e, { state }) {
        const a = state.alerts.find((x) => x.id === el.dataset.id);
        if (!a) return;
        addToOrder(state, a);
        a.done = true;
        KS.store.save();
        KS.ui.toast(KS.t('alert.added', { item: KS.nm(state.ingredients[a.ing]), meal: KS.t('meal.' + a.meal) }), {
          icon: 'check', action: { label: KS.t('draft.title'), fn: () => KS.app.go('draft', a.planId) },
        });
        KS.app.render();
      },
      alertDone(el, e, { state }) {
        const a = state.alerts.find((x) => x.id === el.dataset.id);
        if (a) a.done = true;
        KS.store.save();
        KS.app.render();
      },
    },
  };
})();
