/* Step 3 · Stock: usable stock per ingredient with one status word. Details and fixes behind a tap. */
KS.screens.stock = (function () {
  const { esc, icon } = KS.ui;
  const RANK = { units: 0, stale: 1, none: 2, soon: 3, fresh: 4 };

  const agoText = (age) => (age === 0 ? KS.t('ago.today') : age === 1 ? KS.t('ago.yesterday') : KS.t('ago.days', { n: age }));
  const keyOf = (s) => (!s.has ? 'none' : s.conv === 'mismatch' ? 'units' : s.fresh);

  // Recount sheet: enter what's on the shelf, in the recipe's unit. Also fixes unit mismatches.
  function openRecount(state, ingId) {
    const ing = state.ingredients[ingId];
    const rec = state.stock[ingId];
    const start = rec ? KS.unitsMath.convert(rec.qty, rec.unit, ing.unit) : null;
    const step = KS.unitsMath.isCount(ing.unit) ? 1 : ing.buyStep >= 1 ? 0.5 : ing.buyStep || 0.1;
    let val = start != null ? KS.calc.round3(start) : 0;
    KS.ui.openSheet({
      focus: '#rc-input',
      render: () =>
        KS.ui.sheetHead(KS.nm(ing), KS.t('stock.recountSub', { unit: KS.unitLabel(ing.unit) })) +
        '<div class="covers" role="group" aria-label="' + esc(KS.nm(ing)) + '">' +
        '<button type="button" id="rc-m" data-act="step" data-d="-1" aria-label="−">' + icon('minus', 24) + '</button>' +
        '<input id="rc-input" data-in="val" inputmode="decimal" value="' + val + '" aria-label="' + esc(KS.nm(ing) + ' (' + KS.unitLabel(ing.unit) + ')') + '" autocomplete="off">' +
        '<button type="button" id="rc-p" data-act="step" data-d="1" aria-label="+">' + icon('plus', 24) + '</button></div>' +
        '<p class="meta" style="text-align:center">' + esc(KS.unitLabel(ing.unit)) + '</p>' +
        '<div class="sheet-actions"><button type="button" class="btn btn-outline" data-act="close">' + esc(KS.t('cancel')) + '</button>' +
        '<button type="button" class="btn btn-primary" data-act="save">' + esc(KS.t('save')) + '</button></div>',
      actions: {
        step(el) { val = Math.max(0, KS.calc.round3(val + step * parseInt(el.dataset.d, 10))); KS.ui.renderSheet(); },
        save() {
          state.stock[ingId] = { qty: val, unit: ing.unit, recordedOn: KS.date.today(), countStale: false };
          KS.store.save();
          KS.ui.closeSheet();
          KS.app.render();
        },
      },
      inputs: { val(el) { const n = parseFloat(el.value.replace(',', '.')); val = isNaN(n) ? 0 : Math.max(0, n); } },
    });
  }

  function openDetail(state, plan, ingId) {
    const ing = state.ingredients[ingId];
    KS.ui.openSheet({
      render() {
        const need = KS.calc.needs(state, plan).find((n) => n.ing === ingId);
        const s = KS.calc.stockFor(state, ingId, KS.date.today());
        const key = keyOf(s);
        let note = '';
        if (key === 'units') note = '<p class="note warn">' + icon('scale', 16) + '<span>' + esc(KS.t('stock.mismatch', { from: KS.unitLabel(s.rec.unit), to: KS.unitLabel(ing.unit) })) + '</span></p>';
        else if (key === 'stale' && !s.rec.countStale) note = '<p class="note bad">' + icon('warn', 16) + '<span>' + esc(KS.t('stock.staleNote')) + '</span></p>';
        else if (s.has && s.conv === 'converted') note = '<p class="note">' + icon('scale', 16) + '<span>' + esc(KS.t('stock.converted', { from: KS.unitLabel(s.rec.unit), to: KS.unitLabel(ing.unit) })) + '</span></p>';
        const actions = [];
        if (key === 'stale') actions.push('<button type="button" class="btn btn-outline" data-act="toggleStale">' + esc(KS.t(s.rec.countStale ? 'stock.dontCount' : 'stock.useAnyway')) + '</button>');
        actions.push('<button type="button" class="btn ' + (key === 'units' ? 'btn-primary' : 'btn-outline') + '" data-act="recount">' + esc(key === 'units' ? KS.t('stock.recount', { to: KS.unitLabel(ing.unit) }) : KS.t('stock.edit')) + '</button>');
        return KS.ui.sheetHead(KS.nm(ing), s.has ? KS.t('stock.recordedOn', { ago: agoText(s.age) }) + ' · ' + KS.date.fmt(s.rec.recordedOn) : KS.t('fresh.none')) +
          '<div class="facts"><div><span class="k">' + esc(KS.t('stock.need')) + '</span>' + KS.fmt.qty('sd-n', need ? need.total : 0, ing.unit) + '</div>' +
          '<div><span class="k">' + esc(KS.t('stock.recorded')) + '</span>' + (s.has ? KS.fmt.qty('sd-r', s.rec.qty, s.rec.unit) : '<span class="qty">—</span>') + '</div>' +
          '<div><span class="k">' + esc(KS.t('stock.usable')) + '</span>' + KS.fmt.qty('sd-u', s.usable, ing.unit) + '</div></div>' +
          '<p style="margin-bottom:12px">' + KS.ui.status(key) + '</p>' + note +
          '<div class="sheet-actions">' + actions.join('') + '</div>';
      },
      actions: {
        toggleStale() { const rec = state.stock[ingId]; if (rec) rec.countStale = !rec.countStale; KS.store.save(); KS.ui.renderSheet(); KS.app.render(); },
        recount() { openRecount(state, ingId); },
      },
    });
  }

  function render({ state, arg, ui }) {
    const plan = state.plans[arg];
    if (!plan) { KS.ui.toast(KS.t('err.noPlan'), { icon: 'warn' }); return { redirect: ['home'] }; }
    const today = KS.date.today();
    const list = KS.calc.needs(state, plan).map((n) => ({ n, s: KS.calc.stockFor(state, n.ing, today) }));
    list.sort((a, b) => RANK[keyOf(a.s)] - RANK[keyOf(b.s)]);
    const short = list.filter((x) => x.n.total > x.s.usable).length;
    const check = list.filter((x) => ['units', 'stale', 'soon'].includes(keyOf(x.s))).length;
    const summary = short || check ? [short ? KS.t('stock.short', { n: short }) : '', check ? KS.t('stock.check', { n: check }) : ''].filter(Boolean).join(' · ') : KS.t('stock.allGood');

    const head = KS.ui.flowbar(3) +
      '<header class="head"><p class="kicker">' + esc(KS.planLine(plan) + ' · ' + KS.t('people', { n: plan.covers })) + '</p><h1 class="title">' + esc(KS.t('stock.title')) + '</h1>' +
      '<p class="sub">' + esc(summary) + '</p></header>';
    const dock = '<button type="button" class="btn btn-primary btn-block" data-action="next">' + esc(KS.t('stock.cta')) + icon('arrow', 20) + '</button>';

    const seenKey = 'stock:' + plan.id;
    if (!ui.seen[seenKey]) {
      ui.seen[seenKey] = true;
      setTimeout(() => { if (KS.app.current.route === 'stock') KS.app.render(); }, 380);
      return { html: head + KS.ui.skeletonList(7), dock };
    }

    const empty = Object.keys(state.stock).length === 0 ? '<p class="note" style="margin-bottom:16px">' + icon('empty', 16) + '<span>' + esc(KS.t('stock.empty')) + '</span></p>' : '';
    const rows = list.map(({ n, s }) => {
      const ing = state.ingredients[n.ing];
      const key = keyOf(s);
      const recordedDiffers = s.has && Math.abs((s.base == null ? -1 : s.base) - s.usable) > 1e-9;
      return '<button type="button" class="row" id="st-' + n.ing + '" data-action="detail" data-ing="' + n.ing + '">' +
        '<span class="row-main"><span class="row-name">' + esc(KS.nm(ing)) + '</span><span class="row-meta">' + KS.ui.status(key) + '</span></span>' +
        '<span class="row-end"><span class="stack">' + KS.fmt.qty('st-u-' + n.ing, s.usable, ing.unit) +
        (recordedDiffers ? '<span class="meta">' + esc(KS.t('stock.ofRecorded', { q: KS.fmt.text(s.rec.qty, s.rec.unit) })) + '</span>' : '') + '</span></span></button>';
    }).join('');
    return { html: head + empty + '<div class="list">' + rows + '</div>', dock };
  }

  return {
    title: () => KS.t('stock.title'),
    render,
    actions: {
      detail(el, e, { state, arg }) { openDetail(state, state.plans[arg], el.dataset.ing); },
      next(el, e, { arg }) { KS.app.go('draft', arg); },
    },
  };
})();
