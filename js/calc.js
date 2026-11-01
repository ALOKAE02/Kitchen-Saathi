/* Pure maths: dates, units, quantities, stock and the purchase draft. No DOM in here. */

KS.date = (function () {
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const locale = () => (KS.lang === 'hi' ? 'hi-IN' : 'en-IN');
  return {
    iso,
    parse,
    today: () => iso(new Date()),
    add: (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); },
    diff: (a, b) => Math.round((parse(a) - parse(b)) / 86400000), // a minus b, in days
    fmt: (s, opts) => new Intl.DateTimeFormat(locale(), opts || { day: 'numeric', month: 'short' }).format(parse(s)),
    long: (s) => new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(parse(s)),
    time: (isoStr) => new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' }).format(new Date(isoStr)),
    // The next meal worth planning, by the clock.
    nextMeal: () => { const h = new Date().getHours(); return h < 9 ? 'breakfast' : h < 15 ? 'lunch' : 'dinner'; },
  };
})();

KS.MEALS = ['breakfast', 'lunch', 'dinner'];

KS.unitsMath = (function () {
  const BASE = { kg: ['mass', 1], g: ['mass', 0.001], L: ['vol', 1], ml: ['vol', 0.001], pc: ['pc', 1], bunch: ['bunch', 1] };
  return {
    // Returns null when the units measure different things (kg vs L): we never guess density.
    convert(qty, from, to) {
      const a = BASE[from], b = BASE[to];
      if (!a || !b || a[0] !== b[0]) return null;
      return (qty * a[1]) / b[1];
    },
    isCount: (u) => u === 'pc' || u === 'bunch',
  };
})();

KS.fmt = (function () {
  const num = (v, max) => v.toLocaleString('en-IN', { maximumFractionDigits: max, minimumFractionDigits: 0 });

  // Smart display: below 1 kg / 1 L show grams / ml, as a cook would say it.
  function parts(value, unit) {
    const v = Math.max(0, value || 0);
    if ((unit === 'kg' || unit === 'L') && v > 0 && v < 1) {
      const small = v * 1000;
      const n = small < 10 ? num(Math.round(small * 10) / 10, 1) : small < 100 ? num(Math.round(small), 0) : num(Math.round(small / 5) * 5, 0);
      return { n, u: unit === 'kg' ? 'g' : 'ml' };
    }
    if (KS.unitsMath.isCount(unit)) return { n: num(Math.round(v * 10) / 10, 1), u: unit };
    const n = v >= 100 ? num(Math.round(v), 0) : v >= 10 ? num(v, 1) : num(v, 2);
    return { n, u: unit };
  }

  return {
    parts,
    text(value, unit) { const p = parts(value, unit); return p.n + ' ' + KS.unitLabel(p.u); },
    inner(value, unit) { const p = parts(value, unit); return '<span class="n">' + p.n + '</span><span class="u">' + KS.unitLabel(p.u) + '</span>'; },
    // A live quantity chip. `key` lets the UI animate it when the same line changes value.
    qty(key, value, unit, cls) {
      return '<span class="qty ' + (cls || '') + '" data-num="' + key + '" data-raw="' + value + '" data-unit="' + unit + '">' + this.inner(value, unit) + '</span>';
    },
    // Recipe rate per person: grams / ml for weight and volume.
    rate(rate, unit) {
      if (unit === 'kg' || unit === 'L') return { n: num(Math.round(rate * 10000) / 10, 1), u: unit === 'kg' ? 'g' : 'ml', factor: 1000 };
      return { n: num(rate, 2), u: unit, factor: 1 };
    },
    step(step, unit) { return this.text(step, unit); },
  };
})();

KS.calc = (function () {
  const round3 = (x) => Math.round(x * 1000) / 1000;
  const roundUp = (x, step) => (x <= 0 ? 0 : round3(Math.ceil(x / step - 1e-9) * step));

  // Quantity per ingredient for a plan, with the dish-by-dish breakdown kept for "why this number".
  function needs(state, plan) {
    const map = new Map();
    plan.dishes.forEach((dishId) => {
      const dish = state.dishes[dishId];
      if (!dish) return;
      Object.keys(dish.recipe).forEach((ing) => {
        if (!state.ingredients[ing]) return;
        const rate = dish.recipe[ing];
        const qty = rate * plan.covers;
        if (!map.has(ing)) map.set(ing, { ing, total: 0, parts: [] });
        const row = map.get(ing);
        row.total = round3(row.total + qty);
        row.parts.push({ dish: dishId, rate, qty: round3(qty) });
      });
    });
    return Array.from(map.values());
  }

  function freshness(ingredient, ageDays) {
    const [fresh, soon] = ingredient.shelf;
    if (ageDays <= fresh) return 'fresh';
    if (ageDays <= soon) return 'soon';
    return 'stale';
  }

  // Recorded vs usable stock for one ingredient.
  function stockFor(state, ingId, today) {
    const ingredient = state.ingredients[ingId];
    const rec = state.stock[ingId];
    if (!rec || !(rec.qty > 0)) return { has: false, fresh: 'none', usable: 0, conv: 'same' };
    const base = KS.unitsMath.convert(rec.qty, rec.unit, ingredient.unit);
    const age = Math.max(0, KS.date.diff(today, rec.recordedOn));
    const fresh = freshness(ingredient, age);
    const conv = base == null ? 'mismatch' : rec.unit === ingredient.unit ? 'same' : 'converted';
    let usable = base == null ? 0 : base;
    if (fresh === 'stale' && !rec.countStale) usable = 0;
    return { has: true, rec, base, age, fresh, conv, usable: round3(usable), staleSkipped: fresh === 'stale' && !rec.countStale };
  }

  function autoDraft(state, plan, today) {
    const buy = [], covered = [];
    needs(state, plan).forEach((n) => {
      const s = stockFor(state, n.ing, today);
      const ingredient = state.ingredients[n.ing];
      const raw = round3(n.total - s.usable);
      const step = KS.unitsMath.isCount(ingredient.unit) ? Math.max(1, ingredient.buyStep || 1) : ingredient.buyStep || 0.25;
      const row = { ing: n.ing, need: n.total, usable: s.usable, raw, step, stock: s };
      if (raw > 0) { row.qty = roundUp(raw, step); buy.push(row); } else covered.push(row);
    });
    return { buy, covered };
  }

  // Keep the saved draft in step with the plan. Manual edits survive until covers, dishes,
  // rates or stock change the computed list; items the manager added always survive.
  function syncDraft(state, plan, today) {
    const auto = autoDraft(state, plan, today);
    const sig = auto.buy.map((b) => b.ing + ':' + b.qty).join('|') + '#' + auto.covered.map((c) => c.ing).join('|');
    let recalculated = false;
    if (!plan.draft || plan.draft.sig !== sig) {
      const kept = plan.draft ? plan.draft.items.filter((i) => i.source === 'added') : [];
      recalculated = !!plan.draft;
      plan.draft = {
        sig,
        createdAt: Date.now(),
        items: auto.buy.map((b) => ({ key: b.ing, ing: b.ing, unit: state.ingredients[b.ing].unit, qty: b.qty, auto: b.qty, source: 'auto', edited: false }))
          .concat(kept.filter((k) => !auto.buy.some((b) => b.ing === k.ing))),
      };
    }
    return { auto, draft: plan.draft, recalculated };
  }

  function itemName(state, item) {
    return item.ing ? KS.nm(state.ingredients[item.ing]) : item.name;
  }

  function orderText(state, plan) {
    const t = KS.t;
    const items = plan.draft.items.filter((i) => i.qty > 0);
    const lines = [
      '*' + t('wa.head') + '* — ' + state.kitchen.name,
      t('meal.' + plan.meal) + ' · ' + KS.date.fmt(plan.date, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + t('people', { n: plan.covers }),
      '',
    ];
    items.forEach((i, idx) => lines.push((idx + 1) + '. ' + itemName(state, i) + ' — ' + KS.fmt.text(i.qty, i.unit)));
    lines.push('', t('wa.total', { n: items.length }), '_' + t('wa.footer') + '_');
    return lines.join('\n');
  }

  return { needs, stockFor, autoDraft, syncDraft, itemName, orderText, roundUp, round3 };
})();
