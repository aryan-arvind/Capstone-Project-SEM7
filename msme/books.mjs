// Small helpers over the simulator state: receivables, payables, and the snapshot the constraint layer reads.
// State is plain JSON (no classes, no closures) so it can be cloned, hashed and stored.

export const sum = (xs, f = x => x) => xs.reduce((s, x) => s + f(x), 0);
export const arTotal = st => sum(st.ar, i => i.amount);
export const apTotal = st => sum(st.ap, i => i.amount);
export const incomingUnits = st => sum(st.inv.incoming, i => i.units);
export const round = Math.round;

export function addAR(st, amount, dueWeek, noise, expected, p) {
  amount = round(amount); if (amount <= 0) return null;
  const lags = p.sim.customer_extra_lag_weeks;
  const meanLag = round(sum(lags) / lags.length);
  const lag = expected ? meanLag : lags[Math.min(lags.length - 1, Math.floor(noise * lags.length))];
  const inv = { id: 'AR' + (++st.seq), amount, issued: st.week, due: dueWeek, pay: dueWeek + lag, exp: dueWeek + meanLag };
  st.ar.push(inv);
  return inv;
}

export function addAP(st, amount, issuedWeek, noise, p) {
  amount = round(amount); if (amount <= 0) return null;
  const inv = { id: 'AP' + (++st.seq), amount, issued: issuedWeek, due: issuedWeek + p.sim.supplier_terms_weeks, msme: noise < p.sim.msme_supplier_share };
  st.ap.push(inv);
  return inv;
}

/** Take up to `amount` of receivables chosen by `pick` order, splitting the last invoice. Returns the pieces taken. */
export function takeAR(st, amount, order, filter = () => true) {
  const out = []; let left = round(amount);
  for (const inv of [...st.ar].filter(filter).sort(order)) {
    if (left <= 0) break;
    const take = Math.min(inv.amount, left);
    out.push({ inv, take, whole: take === inv.amount });
    inv.amount -= take; left -= take;
  }
  st.ar = st.ar.filter(i => i.amount > 0);
  return out;
}

export function takeAP(st, amount, order, filter = () => true) {
  const out = []; let left = round(amount);
  for (const inv of [...st.ap].filter(filter).sort(order)) {
    if (left <= 0) break;
    const take = Math.min(inv.amount, left);
    out.push({ inv: { ...inv }, take });
    inv.amount -= take; left -= take;
  }
  st.ap = st.ap.filter(i => i.amount > 0);
  return out;
}

/** Everything a constraint needs, at the end of a week. Pure function of the state. */
export function snapshot(st, p) {
  const ar = arTotal(st), ap = apTotal(st);
  const invValue = st.inv.units * p.sim.unit_cost;
  const shortfall = Math.max(0, -st.cash);
  const currentAssets = Math.max(0, st.cash) + ar + invValue;
  const currentLiabilities = ap + st.od.used + st.gstPayable + shortfall;
  const termWeeks = p.constraints.payment_term_days / 7;
  const msmeOverdue = sum(st.ap.filter(i => i.msme && (st.week - i.issued) > termWeeks), i => i.amount);
  return {
    week: st.week, cash: st.cash, odUsed: st.od.used, odLimit: st.od.limit, ar, ap,
    invUnits: st.inv.units, committedUnits: st.inv.units + incomingUnits(st), invValue,
    currentRatio: currentLiabilities > 0 ? currentAssets / currentLiabilities : 99,
    msmeOverdue, gstPayable: st.gstPayable,
  };
}
