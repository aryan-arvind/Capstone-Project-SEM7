// The MSME simulator: one company, one week per step, all money in integer INR.
//
//   initState(seed, scenario, params)   -> state   (the same seed always gives the same state)
//   step(state, { expected })           -> record  (advances one week, mutating state)
//   project(state, pending, weeks)      -> [snapshot...]  (expected-value look-ahead on a copy)
//
// Randomness is drawn once, at init, into state.noise (one row per week), so every strategy that
// runs on a given (seed, scenario) faces exactly the same demand, customer payment delays and
// breakdowns, whatever it decides to do. step() itself uses no random numbers. With expected:true it
// uses the expected value of every random quantity; the constraint layer and the Arbiter look ahead
// that way, and so never see the future shock a scenario injects.
import { stream } from './rng.mjs';
import { addAR, addAP, arTotal, apTotal, snapshot, sum, round } from './books.mjs';
import { ACTIONS } from './actions.mjs';

export const clone = st => structuredClone(st);

export function initState(seed, scenario = 'baseline', p) {
  const s = p.sim, r = stream(seed);
  const rows = s.episode_weeks + p.sim.horizon_weeks + 4;
  const noise = Array.from({ length: rows }, () => ({ demand: r.normal(), lag: r(), msme: r(), breakdown: r() }));
  const st = {
    seed, scenario, week: 0, seq: 0, cash: s.opening.cash,
    ar: [], ap: [], inv: { units: s.opening.inventory_units, incoming: [] },
    od: { limit: s.opening.od_limit, used: s.opening.od_used },
    gstPayable: 0, maint: { last: 0 },
    demandMult: 1, costMult: 1, demandUntil: -1, costUntil: -1,
    pending: [], events: makeEvents(scenario, p),
    noise,
    stats: { revenue: 0, cogs: 0, profit: 0, stockoutUnits: 0, stockoutWeeks: 0, interest: 0, penalties: 0, discounts: 0, factoringFees: 0, maintenance: 0, payroll: 0, fixed: 0 },
    history: { revenue: [], cogs: [] },
  };
  // opening books: four weeks of customer invoices still to collect, four weeks of supplier invoices still to pay
  const weekly = round(s.base_demand_units * s.price * 0.97);
  for (let k = -3; k <= 0; k++) {
    st.week = k; addAR(st, weekly, k + s.customer_credit_weeks, r(), false, p);
    addAP(st, round(s.base_demand_units * s.unit_cost * 0.97), k, r(), p);
  }
  st.week = 0;
  st.gstPayable = round(weekly * 4 * s.gst_rate_of_sales * 0.5);
  return st;
}

/** Scenario injectors: shocks the look-ahead cannot see until they have happened. */
export function makeEvents(scenario, p) {
  const w = p.scenarios.event_week, c = p.scenarios[scenario];
  switch (scenario) {
    case 'baseline': return [];
    case 'delayed_receivable': return [{ week: w, type: 'delay_largest_receivable', weeks: c.delay_weeks }];
    case 'supplier_price_spike': return [{ week: w, type: 'cost_spike', mult: c.cost_multiplier, until: w + c.duration_weeks }];
    case 'demand_surge': return [{ week: w, type: 'demand_surge', mult: c.demand_multiplier, until: w + c.duration_weeks }];
    case 'credit_limit_tightened': return [{ week: w, type: 'limit_cut', mult: c.limit_multiplier }];
    default: throw new Error('unknown scenario: ' + scenario);
  }
}
export const SCENARIOS = ['baseline', 'delayed_receivable', 'supplier_price_spike', 'demand_surge', 'credit_limit_tightened'];

function applyEvent(st, ev) {
  if (ev.type === 'delay_largest_receivable') {
    const big = [...st.ar].sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id))[0];
    if (big) big.pay += ev.weeks; // the customer pays late; only `pay` (the truth) moves, `exp` (the forecast) does not
  } else if (ev.type === 'cost_spike') { st.costMult = ev.mult; st.costUntil = ev.until; }
  else if (ev.type === 'demand_surge') { st.demandMult = ev.mult; st.demandUntil = ev.until; }
  else if (ev.type === 'limit_cut') st.od.limit = round(st.od.limit * ev.mult);
}

/** Queue an approved proposal for the week it is due. */
export function schedule(st, proposal) { st.pending.push({ week: proposal.timing_week, type: proposal.action_type, amount: proposal.amount_inr, agent: proposal.agent }); }

/** Advance one week. Returns what happened, for the audit trail and the charts. */
export function step(st, { expected = false, p }) {
  const s = p.sim, w = st.week, nz = st.noise[Math.min(w, st.noise.length - 1)];
  const rec = { week: w, actions: [], demand: 0, fulfilled: 0, stockout: 0, revenue: 0 };
  const cash0 = st.cash;

  if (!expected) for (const ev of st.events.filter(e => e.week === w)) applyEvent(st, ev);
  if (st.demandUntil === w) st.demandMult = 1;
  if (st.costUntil === w) st.costMult = 1;

  // 1. approved actions due this week
  const ctx = { p, expected, noise: nz };
  st.pending.sort((a, b) => a.week - b.week);
  const due = st.pending.filter(a => a.week <= w); st.pending = st.pending.filter(a => a.week > w);
  for (const a of due) { ACTIONS[a.type].apply(st, a.amount, ctx); rec.actions.push({ type: a.type, amount: a.amount, agent: a.agent }); }

  // 2. stock that arrives this week (anything over capacity is turned away)
  for (const g of st.inv.incoming.filter(g => g.week <= w)) {
    const room = Math.max(0, s.inventory_capacity_units - st.inv.units);
    const take = Math.min(room, g.units); st.inv.units += take; rec.rejectedUnits = (rec.rejectedUnits || 0) + (g.units - take);
  }
  st.inv.incoming = st.inv.incoming.filter(g => g.week > w);

  // 3. this week's demand and sales (all on credit)
  const season = 1 + s.seasonal_amplitude * Math.sin(2 * Math.PI * w / 13);
  const demand = Math.max(0, round(s.base_demand_units * st.demandMult * season * (1 + (expected ? 0 : s.demand_noise_sd * nz.demand))));
  const fulfilled = Math.min(demand, st.inv.units);
  st.inv.units -= fulfilled;
  const revenue = fulfilled * s.price, cogs = fulfilled * s.unit_cost;
  if (revenue > 0) addAR(st, revenue, w + s.customer_credit_weeks, nz.lag, expected, p);
  st.gstPayable += round(revenue * s.gst_rate_of_sales);
  Object.assign(rec, { demand, fulfilled, stockout: demand - fulfilled, revenue });
  st.stats.revenue += revenue; st.stats.cogs += cogs; st.stats.stockoutUnits += demand - fulfilled;
  if (demand > fulfilled) st.stats.stockoutWeeks++;

  // 4. customers pay (the truth, or the forecast)
  let receipts = 0;
  for (const i of st.ar) if ((expected ? i.exp : i.pay) <= w) receipts += i.amount;
  st.ar = st.ar.filter(i => (expected ? i.exp : i.pay) > w); st.cash += receipts;

  // 5. we pay: suppliers due, payroll, running costs, GST on its due week
  let paidAP = 0;
  for (const i of st.ap) if (i.due <= w) paidAP += i.amount;
  st.ap = st.ap.filter(i => i.due > w); st.cash -= paidAP;
  st.cash -= s.payroll_per_week + s.fixed_cost_per_week; st.stats.payroll += s.payroll_per_week; st.stats.fixed += s.fixed_cost_per_week;
  let gst = 0;
  if ((w + 1) % s.gst_every_weeks === 0) { gst = st.gstPayable; st.cash -= gst; st.gstPayable = 0; }

  // 6. cost of money and of lateness
  const interest = round(st.od.used * s.od_rate_annual / 52 + Math.max(0, -st.cash) * s.unauthorised_od_rate_annual / 52);
  st.cash -= interest; st.stats.interest += interest;
  const termWeeks = p.constraints.payment_term_days / 7;
  const late = round(sum(st.ap.filter(i => i.msme && (w + 1 - i.issued) > termWeeks), i => i.amount) * s.msme_late_interest_multiple * s.od_rate_annual / 52);
  st.cash -= late; st.stats.penalties += late;

  // 7. machines: overdue maintenance risks a breakdown (expected cost when looking ahead)
  if (w - st.maint.last >= s.maintenance_interval_weeks) {
    const cost = expected ? round(s.breakdown_prob_when_overdue * s.breakdown_cost) : (nz.breakdown < s.breakdown_prob_when_overdue ? s.breakdown_cost : 0);
    st.cash -= cost; st.stats.maintenance += cost; rec.breakdown = cost;
  }

  const operating = revenue - cogs - s.payroll_per_week - s.fixed_cost_per_week - interest - late - (rec.breakdown || 0);
  st.stats.profit += operating;
  Object.assign(rec, { receipts, paidAP, gst, interest, late, cashStart: cash0, cashEnd: st.cash });
  st.history.revenue.push(revenue); st.history.cogs.push(cogs);
  st.week = w + 1;
  return rec;
}

/** Look ahead `weeks` weeks in expected-value mode with the given extra pending actions. Does not touch `st`. */
export function project(st, extraPending, weeks, p) {
  const c = clone(st);
  for (const a of extraPending) c.pending.push(a);
  const out = [];
  for (let k = 0; k < weeks; k++) { step(c, { expected: true, p }); out.push(snapshot(c, p)); }
  return out;
}

/** The numbers on the top bar and in the audit: DSO, DPO, DIO, CCC (days) and runway (weeks). */
export function metrics(st, p) {
  const s = p.sim, n = Math.min(4, st.history.revenue.length);
  const avgRev = n ? sum(st.history.revenue.slice(-n)) / n : s.base_demand_units * s.price;
  const avgCogs = n ? sum(st.history.cogs.slice(-n)) / n : s.base_demand_units * s.unit_cost;
  const dso = avgRev > 0 ? arTotal(st) / avgRev * 7 : 0;
  const dpo = avgCogs > 0 ? apTotal(st) / avgCogs * 7 : 0;
  const dio = avgCogs > 0 ? st.inv.units * s.unit_cost / avgCogs * 7 : 0;
  const burn = s.payroll_per_week + s.fixed_cost_per_week;
  const runway = Math.max(0, Math.min(99, (st.cash + Math.max(0, st.od.limit - st.od.used)) / burn));
  return { cash: st.cash, dso, dpo, dio, ccc: dso + dio - dpo, runway };
}
