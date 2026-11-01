/* Step 1 · Plan: when, which meal, which dishes, how many people. All taps, no typing needed. */
KS.screens.plan = (function () {
  const { esc, icon } = KS.ui;
  let form = null;

  const norm = (s) => String(s || '').toLowerCase().replace(/[\s\-()]/g, '').replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u');

  function ensureForm(state, arg, ui) {
    if (arg && ui.formFor !== arg) {
      const p = state.plans[arg];
      if (!p) return false;
      ui.form = { date: p.date, meal: p.meal, dishes: p.dishes.slice(), covers: p.covers, q: '' };
      ui.formFor = arg;
    }
    if (!ui.form) {
      ui.form = { date: KS.date.today(), meal: null, dishes: [], covers: state.kitchen.usualCovers, q: '' };
      ui.formFor = 'new';
    }
    if (!ui.form.meal) {
      // Default to the next meal that has no plan yet.
      const start = KS.MEALS.indexOf(KS.date.nextMeal());
      const order = KS.MEALS.slice(start).concat(KS.MEALS.slice(0, start));
      ui.form.meal = order.find((m) => !state.plans[KS.store.planId(ui.form.date, m)]) || KS.date.nextMeal();
    }
    form = ui.form;
    return true;
  }

  function render({ state, arg, ui }) {
    if (!ensureForm(state, arg, ui)) return { redirect: ['home'] };
    const today = KS.date.today(), tomorrow = KS.date.add(today, 1);
    const isOther = form.date !== today && form.date !== tomorrow;

    const when = '<div class="chips">' +
      '<button type="button" class="chip" id="d-today" data-action="setDate" data-v="' + today + '" aria-pressed="' + (form.date === today) + '">' + esc(KS.t('plan.today')) + '</button>' +
      '<button type="button" class="chip" id="d-tom" data-action="setDate" data-v="' + tomorrow + '" aria-pressed="' + (form.date === tomorrow) + '">' + esc(KS.t('plan.tomorrow')) + '</button>' +
      '<label class="chip date" data-pressed="' + isOther + '">' + icon('cal', 16) + '<span>' + esc(isOther ? KS.date.fmt(form.date) : KS.t('plan.pickDate')) + '</span>' +
      '<input type="date" id="d-other" data-input="otherDate" min="' + today + '" value="' + form.date + '" aria-label="' + esc(KS.t('plan.pickDate')) + '"></label></div>' +
      '<div class="chips" style="margin-top:8px">' + KS.MEALS.map((m) =>
        '<button type="button" class="chip" id="m-' + m + '" data-action="setMeal" data-v="' + m + '" aria-pressed="' + (form.meal === m) + '">' + esc(KS.t('meal.' + m)) + '</button>').join('') + '</div>';

    // Recent dishes first, then the ones usual for this meal, then the rest.
    const ids = Object.keys(state.dishes);
    const rank = (id) => (state.recent.includes(id) ? -10 + state.recent.indexOf(id) : 0) + (state.dishes[id].meals.includes(form.meal) ? 0 : 20);
    let list = ids.slice().sort((a, b) => rank(a) - rank(b));
    if (form.q) { const q = norm(form.q); list = list.filter((id) => norm(state.dishes[id].en).includes(q) || norm(state.dishes[id].hi).includes(q)); }
    const dishes = list.length
      ? '<div class="list">' + list.map((id) =>
          '<button type="button" class="row" id="dish-' + id + '" data-action="toggleDish" data-id="' + id + '" aria-pressed="' + form.dishes.includes(id) + '">' +
          '<span class="row-main"><span class="row-name">' + esc(KS.nm(state.dishes[id])) + '</span></span>' +
          '<span class="row-end"><span class="check">' + icon('check', 16) + '</span></span></button>').join('') + '</div>'
      : '<p class="meta" style="padding:16px 0">' + esc(KS.t('plan.noMatch', { q: form.q })) + '</p>';

    const html = KS.ui.flowbar(1) +
      '<header class="head"><h1 class="title">' + esc(KS.t('plan.title')) + '</h1></header>' +
      '<section>' + when + '</section>' +
      '<section class="section"><div class="spread" style="margin-bottom:8px"><h2 class="h2">' + esc(KS.t('plan.dishes')) + '</h2>' +
      '<span class="meta" aria-live="polite">' + esc(KS.t('plan.selected', { n: form.dishes.length })) + '</span></div>' +
      '<label class="search" style="margin-bottom:8px"><span class="sr-only">' + esc(KS.t('plan.search')) + '</span>' + icon('search', 18) +
      '<input class="input" type="search" id="dish-q" data-input="q" placeholder="' + esc(KS.t('plan.search')) + '" value="' + esc(form.q) + '" autocomplete="off"></label>' +
      dishes + '</section>' +
      '<section class="section"><h2 class="h2" style="margin-bottom:16px">' + esc(KS.t('plan.covers')) + '</h2>' + KS.ui.coversInput(form.covers, state.kitchen.usualCovers) + '</section>';

    const problem = !form.dishes.length ? KS.t('plan.needDish') : !KS.validCovers(form.covers) ? KS.t('plan.badCovers') : '';
    const dock = (problem ? '<p class="dock-hint" id="plan-hint">' + esc(problem) + '</p>' : '') +
      '<button type="button" class="btn btn-primary btn-block" data-action="calculate" aria-disabled="' + !!problem + '"' + (problem ? ' aria-describedby="plan-hint"' : '') + '>' +
      esc(KS.t('plan.cta')) + icon('arrow', 20) + '</button>';
    return { html, dock };
  }

  const covers = KS.coversHandlers(() => form.covers, (v) => { form.covers = v; });

  return {
    title: () => KS.t('plan.title'),
    render,
    onBlocked() {
      const hint = document.getElementById('plan-hint');
      if (hint && hint.animate && !KS.ui.reduced()) hint.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 240 });
    },
    actions: Object.assign({
      setDate(el) { form.date = el.dataset.v; KS.app.render(); },
      setMeal(el) { form.meal = el.dataset.v; KS.app.render(); },
      toggleDish(el) {
        const id = el.dataset.id;
        form.dishes = form.dishes.includes(id) ? form.dishes.filter((d) => d !== id) : form.dishes.concat(id);
        KS.app.render();
      },
      calculate(el, e, { ui }) {
        const plan = KS.store.upsertPlan(form);
        ui.formFor = plan.id;
        KS.app.go('calc', plan.id);
      },
    }, covers.actions),
    inputs: Object.assign({
      q(el) { form.q = el.value; KS.app.render(); },
      otherDate(el) { if (el.value) { form.date = el.value; KS.app.render(); } },
    }, covers.inputs),
  };
})();
