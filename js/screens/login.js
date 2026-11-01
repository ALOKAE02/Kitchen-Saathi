/* Sign in: Google's own button when a Client ID is configured, plus a demo path. */
KS.screens.login = (function () {
  const { esc, icon } = KS.ui;

  function render() {
    const name = KS.t('appName').split(' ');
    let google;
    if (!KS.auth.serverAvailable || !KS.auth.configured) {
      google = '<button type="button" class="btn btn-primary btn-block" aria-disabled="true" aria-describedby="g-setup">' + esc(KS.t('auth.google')) + '</button>' +
        '<p class="fine" id="g-setup" style="margin-top:10px;text-align:center">' + esc(KS.t(KS.auth.serverAvailable ? 'auth.setup' : 'auth.noServer')) + '</p>';
    } else if (KS.auth.busy) {
      google = '<p class="btn btn-primary btn-block" role="status" aria-disabled="true">' + esc(KS.t('auth.signingIn')) + '</p>';
    } else if (KS.auth.failed) {
      google = '<p class="note bad">' + icon('warn', 16) + '<span>' + esc(KS.t('auth.gisFail')) + '</span></p>';
    } else {
      google = '<div class="gbtn" id="gbtn" aria-label="' + esc(KS.t('auth.google')) + '"></div>';
    }

    const html = '<section class="login">' +
      '<h1 class="display">' + esc(name[0]) + '<br><span class="squiggle-wrap">' + esc(name.slice(1).join(' ')) + KS.ui.squiggle(false) + KS.ui.sparks + '</span></h1>' +
      '<hr class="rule" style="margin-top:40px">' +
      '<p class="lead">' + esc(KS.t('auth.lead')) + '</p>' +
      '<p class="lede">' + esc(KS.t('auth.sub')) + '</p>' +
      '<hr class="rule">' +
      google +
      '<div style="display:flex;justify-content:center;margin-top:8px"><button type="button" class="btn-text" data-action="demo">' + esc(KS.t('auth.demo')) + icon('arrow', 18) + '</button></div>' +
      '<p class="fine" style="margin-top:28px">' + esc(KS.t('auth.note')) + '</p></section>';

    return {
      html,
      after() { const el = document.getElementById('gbtn'); if (el) KS.auth.renderButton(el); },
    };
  }

  return {
    title: () => KS.t('auth.google'),
    render,
    actions: { demo() { KS.auth.signInDemo(); } },
  };
})();
