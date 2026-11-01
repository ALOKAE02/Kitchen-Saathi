/* First run, after sign-in (step 1 of 3): kitchen name, then usual covers. */

/* Covers stepper behaviour, shared by every screen that edits a cover count. */
KS.coversHandlers = function (get, set) {
  const clamp = (n) => Math.max(1, Math.min(2000, n));
  return {
    actions: {
      coversStep(el) { const cur = parseInt(get(), 10) || 0; set(clamp(cur + parseInt(el.dataset.d, 10))); KS.app.render(); },
      coversSet(el) { set(parseInt(el.dataset.v, 10)); KS.app.render(); },
    },
    inputs: {
      covers(el, e) {
        if (e.type === 'change') return;
        const digits = el.value.replace(/\D/g, '').slice(0, 4);
        set(digits === '' ? '' : parseInt(digits, 10));
        KS.app.render();
      },
    },
  };
};
KS.validCovers = (n) => Number.isInteger(n) && n >= 1 && n <= 2000;

KS.screens.onboarding = (function () {
  const { esc, icon } = KS.ui;
  let ob = null;

  const covers = KS.coversHandlers(() => ob.covers, (v) => { ob.covers = v; });

  function render({ state }) {
    if (!ob) ob = { step: 2, name: state.kitchen.name, covers: state.kitchen.usualCovers, error: '' };
    let body;
    if (ob.step === 2) {
      body = '<h1 class="title">' + esc(KS.t('ob.nameQ')) + '</h1>' +
        '<div class="section"><label><span class="sr-only">' + esc(KS.t('ob.nameQ')) + '</span>' +
        '<input class="input" id="ob-name" data-input="obName" value="' + esc(ob.name) + '" autocomplete="organization" maxlength="80"' + (ob.error ? ' aria-invalid="true" aria-describedby="ob-err"' : '') + '></label>' +
        (ob.error ? '<p class="err-text" id="ob-err">' + esc(ob.error) + '</p>' : '') + '</div>';
    } else {
      body = '<h1 class="title">' + esc(KS.t('ob.coversQ')) + '</h1><div class="section">' + KS.ui.coversInput(ob.covers, null) + '</div>';
    }
    const ok = ob.step !== 3 || KS.validCovers(ob.covers);
    const html = '<p class="kicker" style="margin-top:16px">' + esc(KS.t('ob.step', { n: ob.step })) + '</p>' + body;
    const dock = (ob.step === 3 && !ok ? '<p class="dock-hint">' + esc(KS.t('plan.badCovers')) + '</p>' : '') +
      '<button type="button" class="btn btn-primary btn-block" data-action="obNext" aria-disabled="' + !ok + '">' + esc(KS.t(ob.step === 3 ? 'ob.start' : 'next')) + icon('arrow', 20) + '</button>';
    return { html, dock };
  }

  return {
    title: () => KS.t('ob.step', { n: ob ? ob.step : 2 }),
    render,
    actions: Object.assign({
      obNext(el, e, { state }) {
        if (ob.step === 2) {
          const name = ob.name.trim();
          if (!name) { ob.error = KS.t('ob.nameNeeded'); KS.app.render(); document.getElementById('ob-name').focus(); return; }
          state.kitchen.name = name;
          ob.error = '';
          ob.step = 3;
          KS.app.render();
          const h1 = document.querySelector('#view h1');
          if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus(); }
          return;
        }
        state.kitchen.usualCovers = ob.covers;
        state.kitchen.onboarded = true;
        ob = null;
        KS.store.save();
        KS.app.go('home');
      },
    }, covers.actions),
    inputs: Object.assign({
      obName(el) { ob.name = el.value; if (ob.error && el.value.trim()) { ob.error = ''; KS.app.render(); } },
    }, covers.inputs),
  };
})();
