/* Step 2 · Quantities: one line per ingredient. The maths and the rate live behind a tap. */
KS.screens.calc = (function () {
  const { esc, icon } = KS.ui;

  // Shared by Quantities and Order: changing covers makes every figure on the page move.
  KS.coversInline = function (plan) {
    return '<span class="inline-covers" role="group" aria-label="' + esc(KS.t('plan.covers')) + '">' +
      '<button type="button" class="mini" id="cb-m5" data-action="barStep" data-d="-5" aria-label="−5 ' + esc(KS.t('peopleShort')) + '">−5</button>' +
      '<strong aria-live="polite">' + esc(KS.t('people', { n: plan.covers })) + '</strong>' +
      '<button type="button" class="mini" id="cb-p5" data-action="barStep" data-d="5" aria-label="+5 ' + esc(KS.t('peopleShort')) + '">+5</button></span>';
  };
  KS.barStep = function (plan, d) {
    plan.covers = Math.max(1, Math.min(2000, plan.covers + d));
    if (plan.status === 'ordered') plan.status = 'planned';
    KS.store.save();
    KS.app.render();
  };
  KS.planLine = (plan) => KS.t('meal.' + plan.meal) + ' · ' + KS.date.fmt(plan.date, { weekday: 'short', day: 'numeric', month: 'short' });

  function rateStep(unit, rate) {
    if (unit === 'kg' || unit === 'L') { const g = rate * 1000; return (g < 2 ? 0.5 : g < 20 ? 1 : 5) / 1000; }
    return 0.05;
  }

  function openWhy(state, plan, ingId) {
    const ing = state.ingredients[ingId];
    KS.ui.openSheet({
      render() {
        const need = KS.calc.needs(state, plan).find((n) => n.ing === ingId);
        if (!need) return KS.ui.sheetHead(KS.nm(ing));
        const rows = need.parts.map((p) => {
          const r = KS.fmt.rate(p.rate, ing.unit);
          return '<div class="row"><span class="row-main"><span class="row-name">' + esc(KS.nm(state.dishes[p.dish])) + '</span>' +
            '<span class="row-meta">' + esc(r.n + ' ' + KS.unitLabel(r.u) + ' × ' + plan.covers) + '</span></span>' +
            '<span class="row-end"><span class="qstep" role="group" aria-label="' + esc(KS.nm(state.dishes[p.dish]) + ', ' + KS.t('calc.perPerson')) + '">' +
            '<button type="button" id="r-m-' + p.dish + '" data-act="rate" data-dish="' + p.dish + '" data-d="-1" aria-label="−">' + icon('minus', 18) + '</button>' +
            '<span class="qty" style="font-size:1rem">' + r.n + '<span class="u">' + esc(KS.unitLabel(r.u)) + '</span></span>' +
            '<button type="button" id="r-p-' + p.dish + '" data-act="rate" data-dish="' + p.dish + '" data-d="1" aria-label="+">' + icon('plus', 18) + '</button></span></span></div>';
        }).join('');
        return KS.ui.sheetHead(KS.nm(ing), KS.t('calc.perPerson') + ' × ' + KS.t('people', { n: plan.covers })) +
          '<div class="list">' + rows +
          '<div class="row"><span class="row-name">' + esc(KS.t('why.sum')) + '</span>' + KS.fmt.qty('why-' + ingId, need.total, ing.unit, 'big') + '</div></div>' +
          '<p class="fine">' + esc(KS.t('why.rateNote')) + '</p>';
      },
      actions: {
        rate(el) {
          const recipe = state.dishes[el.dataset.dish].recipe;
          const step = rateStep(ing.unit, recipe[ingId]);
          const next = recipe[ingId] + step * parseInt(el.dataset.d, 10);
          recipe[ingId] = Math.max(step, Math.round(next * 1e6) / 1e6);
          KS.store.save();
          KS.ui.renderSheet();
          KS.app.render();
        },
      },
    });
  }

  function render({ state, arg, ui }) {
    const plan = state.plans[arg];
    if (!plan) { KS.ui.toast(KS.t('err.noPlan'), { icon: 'warn' }); return { redirect: ['home'] }; }
    const head = KS.ui.flowbar(2) +
      '<header class="head"><p class="kicker">' + esc(KS.planLine(plan)) + '</p><h1 class="title">' + esc(KS.t('calc.title')) + '</h1>' +
      '<div class="sub">' + KS.coversInline(plan) + '</div></header>';
    const dock = '<button type="button" class="btn btn-primary btn-block" data-action="next">' + esc(KS.t('calc.cta')) + icon('arrow', 20) + '</button>';

    const seenKey = 'calc:' + plan.id;
    if (!ui.seen[seenKey]) {
      ui.seen[seenKey] = true;
      setTimeout(() => { if (KS.app.current.route === 'calc') KS.app.render(); }, 380);
      return { html: head + KS.ui.skeletonList(7), dock };
    }

    const rows = KS.calc.needs(state, plan).map((n) => {
      const ing = state.ingredients[n.ing];
      return '<button type="button" class="row" id="ing-' + n.ing + '" data-action="why" data-ing="' + n.ing + '">' +
        '<span class="row-main"><span class="row-name">' + esc(KS.nm(ing)) + '</span></span>' +
        '<span class="row-end">' + KS.fmt.qty('calc-' + n.ing, n.total, ing.unit) + '</span></button>';
    }).join('');

    return { html: head + '<div class="list">' + rows + '</div><p class="fine" style="margin-top:12px">' + esc(KS.t('calc.hint')) + '</p>', dock };
  }

  return {
    title: () => KS.t('calc.title'),
    render,
    actions: {
      why(el, e, { state, arg }) { openWhy(state, state.plans[arg], el.dataset.ing); },
      barStep(el, e, { state, arg }) { KS.barStep(state.plans[arg], parseInt(el.dataset.d, 10)); },
      next(el, e, { arg }) { KS.app.go('stock', arg); },
    },
  };
})();
