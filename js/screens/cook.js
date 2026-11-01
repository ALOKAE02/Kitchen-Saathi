/* Cook view: today's saved plan, read only, big type, dish by dish. One tap reports a missing item. */
KS.screens.cook = (function () {
  const { esc, icon } = KS.ui;
  let meal = null;

  function render({ state }) {
    const today = KS.date.today();
    const plans = KS.store.plansOn(today);
    const head = '<header class="head"><p class="kicker">' + esc(KS.date.long(today)) + '</p><h1 class="display">' + esc(KS.t('cook.title')) + '</h1></header>';

    if (!plans.length) {
      return { html: head + '<div class="list"><div class="row"><span class="row-main"><span class="row-name">' + esc(KS.t('cook.emptyTitle')) + '</span>' +
        '<span class="row-meta">' + esc(KS.t('cook.emptyBody')) + '</span></span></div></div>' };
    }

    if (!meal || !plans.some((p) => p.meal === meal)) {
      const next = KS.date.nextMeal();
      meal = (plans.find((p) => p.meal === next) || plans.find((p) => KS.MEALS.indexOf(p.meal) > KS.MEALS.indexOf(next)) || plans[0]).meal;
    }
    const plan = plans.find((p) => p.meal === meal);
    const reported = new Set(state.alerts.filter((a) => a.planId === plan.id && !a.done).map((a) => a.ing));

    const tabs = plans.length > 1 ? '<div class="chips" style="margin-bottom:20px">' + plans.map((p) =>
      '<button type="button" class="chip" id="ck-' + p.meal + '" data-action="meal" data-v="' + p.meal + '" aria-pressed="' + (p.meal === meal) + '">' + esc(KS.t('meal.' + p.meal)) + '</button>').join('') + '</div>' : '';

    const dishes = plan.dishes.filter((d) => state.dishes[d]).map((d) => {
      const dish = state.dishes[d];
      const rows = Object.keys(dish.recipe).filter((ing) => state.ingredients[ing]).map((ingId) => {
        const ing = state.ingredients[ingId];
        const on = reported.has(ingId);
        const name = KS.nm(ing);
        return '<div class="row" style="min-height:72px"><span class="row-main"><span class="row-name" style="font-size:1.125rem">' + esc(name) + '</span></span>' +
          '<span class="row-end">' + KS.fmt.qty('ck-' + plan.id + '-' + d + '-' + ingId, dish.recipe[ingId] * plan.covers, ing.unit, 'cookq') +
          '<button type="button" class="chip" style="padding:0 12px;' + (on ? '' : 'border-color:var(--line-soft)') + '" id="miss-' + d + '-' + ingId + '" data-action="missing" data-ing="' + ingId + '" aria-pressed="' + on + '" aria-label="' + esc(KS.t('cook.reportedLabel', { item: name })) + '">' +
          icon(on ? 'check' : 'bell', 16) + '<span>' + esc(KS.t(on ? 'cook.reported' : 'cook.missing')) + '</span></button></span></div>';
      }).join('');
      return '<section class="section"><h2 class="h2" style="margin-bottom:8px">' + esc(KS.nm(dish)) + '</h2><div class="list">' + rows + '</div></section>';
    }).join('');

    const html = head + tabs +
      '<p class="qty big" style="justify-content:flex-start;margin:0;padding:0">' + plan.covers + '<span class="u">' + esc(KS.t('peopleShort')) + '</span></p>' +
      dishes + '<p class="fine section">' + esc(KS.t('cook.demoNote')) + '</p>';
    return { html };
  }

  return {
    title: () => KS.t('cook.title'),
    render,
    actions: {
      meal(el) { meal = el.dataset.v; KS.app.render(); },
      missing(el, e, { state }) {
        const plan = KS.store.plansOn(KS.date.today()).find((p) => p.meal === meal);
        const ingId = el.dataset.ing;
        const open = state.alerts.find((a) => a.planId === plan.id && a.ing === ingId && !a.done);
        const name = KS.nm(state.ingredients[ingId]);
        if (open) {
          state.alerts = state.alerts.filter((a) => a !== open);
          KS.store.save();
          KS.app.render();
          KS.ui.toast(KS.t('cook.unreported'));
          return;
        }
        KS.store.addAlert(plan, ingId);
        KS.app.render();
        KS.ui.toast(KS.t('cook.reportedToast', { item: name }), { icon: 'bell' });
      },
    },
  };
})();
