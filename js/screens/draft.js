/* Step 4 · Order: needed − usable stock, rounded to how it's sold. Edit, then share. */
KS.screens.draft = (function () {
  const { esc, icon } = KS.ui;
  const drawn = {};

  const itemStep = (state, item) => {
    const ing = item.ing && state.ingredients[item.ing];
    if (KS.unitsMath.isCount(item.unit)) return 1;
    if (!ing) return 0.25;
    return ing.buyStep >= 1 ? 0.5 : ing.buyStep;
  };
  const find = (plan, key) => plan.draft.items.findIndex((i) => i.key === key);
  const markOrdered = (plan) => { plan.status = 'ordered'; plan.sharedAt = new Date().toISOString(); KS.store.save(); };

  // Tap an item: the maths behind it, and the remove action.
  function openItem(state, plan, key) {
    KS.ui.openSheet({
      render() {
        const item = plan.draft.items[find(plan, key)];
        if (!item) return '';
        const name = KS.calc.itemName(state, item);
        const auto = item.source === 'auto' && KS.calc.autoDraft(state, plan, KS.date.today()).buy.find((b) => b.ing === item.ing);
        let body;
        if (auto) {
          const round = KS.unitsMath.isCount(item.unit) ? KS.t('why.roundPc') : KS.t('why.round', { step: KS.fmt.text(auto.step, item.unit) });
          body = '<div class="facts"><div><span class="k">' + esc(KS.t('why.need')) + '</span>' + KS.fmt.qty('w-n', auto.need, item.unit) + '</div>' +
            '<div><span class="k">− ' + esc(KS.t('stock.usable')) + '</span>' + KS.fmt.qty('w-u', auto.usable, item.unit) + '</div>' +
            '<div><span class="k">= ' + esc(KS.t('why.buy')) + '</span>' + KS.fmt.qty('w-b', auto.qty, item.unit) + '</div></div>' +
            '<p class="fine">' + esc(round) + (auto.stock.staleSkipped ? ' ' + esc(KS.t('why.staleSkipped')) : '') + '</p>';
        } else {
          body = '<p class="meta">' + esc(KS.t('why.added')) + '</p>';
        }
        return KS.ui.sheetHead(name) + body +
          '<div class="sheet-actions"><button type="button" class="btn btn-outline btn-danger" data-act="remove">' + icon('x', 18) + esc(KS.t('draft.remove')) + '</button></div>';
      },
      actions: {
        remove() {
          const idx = find(plan, key);
          if (idx < 0) return;
          const [item] = plan.draft.items.splice(idx, 1);
          KS.store.save();
          KS.ui.closeSheet(true);
          KS.app.render();
          KS.ui.toast(KS.t('draft.removed', { item: KS.calc.itemName(state, item) }), {
            action: { label: KS.t('undo'), fn: () => { plan.draft.items.splice(idx, 0, item); KS.store.save(); KS.app.render(); } },
          });
        },
      },
    });
  }

  function openAdd(state, plan) {
    let q = '', custom = null;
    KS.ui.openSheet({
      focus: '#add-q',
      render() {
        const inDraft = new Set(plan.draft.items.map((i) => i.ing).filter(Boolean));
        const nq = q.trim().toLowerCase();
        const hits = Object.keys(state.ingredients).filter((id) => !inDraft.has(id))
          .filter((id) => !nq || state.ingredients[id].en.toLowerCase().includes(nq) || state.ingredients[id].hi.includes(q.trim()))
          .sort((a, b) => KS.nm(state.ingredients[a]).localeCompare(KS.nm(state.ingredients[b])));
        const exact = hits.some((id) => KS.nm(state.ingredients[id]).toLowerCase() === nq);
        let html = KS.ui.sheetHead(KS.t('draft.add')) +
          '<label class="search" style="margin-bottom:8px"><span class="sr-only">' + esc(KS.t('draft.addSearch')) + '</span>' + icon('search', 18) +
          '<input class="input" id="add-q" data-in="q" placeholder="' + esc(KS.t('draft.addSearch')) + '" value="' + esc(q) + '" autocomplete="off"></label>';
        if (custom) {
          return html + '<p class="label" style="margin-top:20px">' + esc(KS.t('draft.pickUnit')) + ' · ' + esc(custom) + '</p><div class="chips">' +
            ['kg', 'L', 'pc', 'bunch'].map((u) => '<button type="button" class="chip" data-act="addCustom" data-unit="' + u + '">' + esc(KS.unitLabel(u)) + '</button>').join('') + '</div>';
        }
        html += '<div class="list">';
        if (nq && !exact) html += '<button type="button" class="row" data-act="startCustom"><span class="row-name">' + esc(KS.t('draft.addCustom', { q: q.trim() })) + '</span>' + icon('plus', 18) + '</button>';
        html += hits.slice(0, 30).map((id) => '<button type="button" class="row" data-act="addIng" data-ing="' + id + '"><span class="row-name">' + esc(KS.nm(state.ingredients[id])) + '</span>' + icon('plus', 18) + '</button>').join('');
        return html + '</div>';
      },
      actions: {
        addIng(el) {
          const ing = state.ingredients[el.dataset.ing];
          added({ key: el.dataset.ing, ing: el.dataset.ing, unit: ing.unit, qty: KS.unitsMath.isCount(ing.unit) ? 1 : ing.buyStep || 1, auto: 0, source: 'added', edited: false });
        },
        startCustom() { custom = q.trim(); KS.ui.renderSheet(); },
        addCustom(el) { added({ key: 'c-' + Date.now(), ing: null, name: custom, unit: el.dataset.unit, qty: 1, auto: 0, source: 'added', edited: false }); },
      },
      inputs: { q(el) { q = el.value; custom = null; KS.ui.renderSheet(); } },
    });
    function added(item) {
      plan.draft.items.push(item);
      if (plan.status === 'ordered') plan.status = 'planned';
      KS.store.save();
      KS.ui.closeSheet();
      KS.app.render();
    }
  }

  function copySheet(text) {
    KS.ui.openSheet({
      focus: '#copy-area',
      render: () => KS.ui.sheetHead(KS.t('draft.copy'), KS.t('draft.copyFail')) + '<textarea class="copy-area" id="copy-area" readonly>' + esc(text) + '</textarea>',
    });
    const ta = document.getElementById('copy-area');
    if (ta) ta.select();
  }

  function render({ state, arg }) {
    const plan = state.plans[arg];
    if (!plan) { KS.ui.toast(KS.t('err.noPlan'), { icon: 'warn' }); return { redirect: ['home'] }; }
    const { auto, draft, recalculated } = KS.calc.syncDraft(state, plan, KS.date.today());
    const items = draft.items;
    const live = items.filter((i) => i.qty > 0);
    const firstView = !drawn[plan.id];
    drawn[plan.id] = true;

    const rows = items.map((item) => {
      const name = KS.calc.itemName(state, item);
      return '<div class="row' + (item.qty > 0 ? '' : ' muted') + '">' +
        '<button type="button" class="row-main" style="background:none;border:0;padding:6px 0;text-align:left;min-height:48px" id="di-' + item.key + '" data-action="item" data-key="' + item.key + '">' +
        '<span class="row-name">' + esc(name) + '</span></button>' +
        '<span class="qstep" role="group" aria-label="' + esc(name) + '">' +
        '<button type="button" id="dm-' + item.key + '" data-action="qty" data-key="' + item.key + '" data-d="-1" aria-label="' + esc(KS.t('draft.qtyLess', { item: name })) + '">' + icon('minus', 18) + '</button>' +
        KS.fmt.qty('d-' + plan.id + '-' + item.key, item.qty, item.unit) +
        '<button type="button" id="dp-' + item.key + '" data-action="qty" data-key="' + item.key + '" data-d="1" aria-label="' + esc(KS.t('draft.qtyMore', { item: name })) + '">' + icon('plus', 18) + '</button></span></div>';
    }).join('');

    const covered = auto.covered.filter((c) => !items.some((i) => i.ing === c.ing));
    const coveredHtml = covered.length
      ? '<details class="section"><summary class="btn-text" style="cursor:pointer;list-style:none">' + esc(KS.t('draft.covered', { n: covered.length })) + '</summary><div class="list" style="margin-top:8px">' +
        covered.map((c) => { const ing = state.ingredients[c.ing]; return '<div class="row muted"><span class="row-name">' + esc(KS.nm(ing)) + '</span><span class="status ok">' + icon('check', 16) + '</span></div>'; }).join('') + '</div></details>'
      : '';

    const sub = plan.status === 'ordered' && plan.sharedAt
      ? '<span class="status ok">' + icon('check', 14) + esc(KS.t('draft.orderedAt', { time: KS.date.time(plan.sharedAt) })) + '</span>'
      : esc(KS.planLine(plan));
    const html = KS.ui.flowbar(4) +
      '<header class="head"><p class="kicker">' + sub + '</p><h1 class="title"><span class="squiggle-wrap">' + esc(KS.t('draft.title')) + (live.length ? KS.ui.squiggle(firstView) : '') + '</span></h1>' +
      '<div class="sub" style="margin-top:20px">' + KS.coversInline(plan) + '</div></header>' +
      (firstView && live.length ? '<p class="sr-only" role="status">' + esc(KS.t('draft.ready')) + '</p>' : '') +
      (recalculated ? '<p class="note" style="margin-bottom:12px">' + icon('check', 16) + '<span>' + esc(KS.t('draft.recalc')) + '</span></p>' : '') +
      (items.length ? '<div class="list">' + rows + '</div>'
        : '<div class="empty" style="padding-top:8px"><h2 class="h2">' + esc(KS.t('draft.emptyTitle')) + '</h2><p class="meta">' + esc(KS.t('draft.emptyBody')) + '</p></div>') +
      '<div style="margin-top:8px"><button type="button" class="btn-text" data-action="add">' + icon('plus', 18) + esc(KS.t('draft.add')) + '</button></div>' +
      coveredHtml;

    const dock = '<p class="dock-meta">' + esc(live.length === 1 ? KS.t('item1') : KS.t('items', { n: live.length })) + '</p>' +
      '<div class="dock-row"><button type="button" class="btn btn-outline" data-action="copy" aria-disabled="' + !live.length + '" aria-label="' + esc(KS.t('draft.copy')) + '">' + icon('copy', 20) + '</button>' +
      '<button type="button" class="btn btn-primary" data-action="share" aria-disabled="' + !live.length + '">' + icon('chat', 20) + esc(KS.t('draft.share')) + '</button></div>';

    if (firstView && live.length && navigator.vibrate && !KS.ui.reduced() && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) { try { navigator.vibrate(12); } catch (e) { /* unsupported */ } }
    KS.store.save();
    return { html, dock };
  }

  return {
    title: () => KS.t('draft.title'),
    render,
    actions: {
      qty(el, e, { state, arg }) {
        const plan = state.plans[arg];
        const item = plan.draft.items[find(plan, el.dataset.key)];
        if (!item) return;
        item.qty = Math.max(0, KS.calc.round3(item.qty + itemStep(state, item) * parseInt(el.dataset.d, 10)));
        item.edited = item.source === 'auto' ? item.qty !== item.auto : item.edited;
        if (plan.status === 'ordered') plan.status = 'planned';
        KS.store.save();
        KS.app.render();
      },
      item(el, e, { state, arg }) { openItem(state, state.plans[arg], el.dataset.key); },
      add(el, e, { state, arg }) { openAdd(state, state.plans[arg]); },
      barStep(el, e, { state, arg }) { KS.barStep(state.plans[arg], parseInt(el.dataset.d, 10)); },
      share(el, e, { state, arg }) {
        const plan = state.plans[arg];
        const text = KS.calc.orderText(state, plan);
        const w = window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
        if (!w) { KS.ui.toast(KS.t('err.popup'), { icon: 'warn' }); copySheet(text); return; }
        try { w.opener = null; } catch (err) { /* cross-origin */ }
        markOrdered(plan);
        KS.app.render();
        KS.ui.toast(KS.t('draft.shared'), { icon: 'check' });
      },
      copy(el, e, { state, arg }) {
        const plan = state.plans[arg];
        const text = KS.calc.orderText(state, plan);
        const done = () => KS.ui.toast(KS.t('draft.copied'), {
          icon: 'copy', action: plan.status === 'ordered' ? null : { label: KS.t('draft.markOrdered'), fn: () => { markOrdered(plan); KS.app.render(); KS.ui.toast(KS.t('draft.markedOrdered'), { icon: 'check' }); } },
        });
        // file:// and older WebViews have no async clipboard: fall back to execCommand, then a select-all sheet.
        const legacy = () => {
          const ta = document.createElement('textarea');
          ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0';
          document.body.appendChild(ta); ta.select();
          let ok = false;
          try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
          ta.remove();
          return ok ? done() : copySheet(text);
        };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, legacy);
        else legacy();
      },
    },
  };
})();
