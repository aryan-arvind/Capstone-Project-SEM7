// The six department agents. Each makes ONE proposal call per decision cycle (the desks inside a
// department are presentation only and make no call of their own).
//
// Each agent is a deterministic, rule-based proposer that reads a numeric summary of the books. It is
// free, instant and reproducible. Every proposal it returns is checked against the schema (schema.mjs).
//
// The agents are not told the hard constraints: a specialist recommends what is best for its own
// department, and finding out whether the set fits the company's cash is the Arbiter's job.
import { actionsOf } from './actions.mjs';
import { DECISION_DEPTS } from './roster.mjs';
import { stream, mix } from './rng.mjs';
import { arTotal, apTotal, incomingUnits, sum } from './books.mjs';
import { project } from './sim.mjs';
import { validateProposal } from './schema.mjs';

const k1000 = x => Math.max(1000, Math.round(x / 1000) * 1000);

/** What an agent is allowed to know: the books as numbers. */
export function stateSummary(st, p) {
  const s = p.sim, w = st.week;
  const demand = s.base_demand_units * st.demandMult;
  const lateWeeks = i => Math.max(0, w - i.due);
  const overdue = st.ar.filter(i => i.due <= w);
  const notDue = st.ar.filter(i => i.due > w);
  const proj = project(st, [], s.horizon_weeks, p);
  return {
    week: w,
    cash_inr: st.cash,
    overdraft_limit_inr: st.od.limit, overdraft_used_inr: st.od.used,
    projected_cash_inr_next_weeks: proj.map(x => x.cash),
    receivables_total_inr: arTotal(st),
    receivables_not_yet_due_inr: sum(notDue, i => i.amount),
    receivables_overdue_inr: sum(overdue, i => i.amount),
    receivables_overdue_15_plus_days_inr: sum(overdue.filter(i => lateWeeks(i) * 7 >= 15), i => i.amount),
    payables_total_inr: apTotal(st),
    payables_due_within_1_week_inr: sum(st.ap.filter(i => i.due <= w + 1), i => i.amount),
    msme_payables_aged_35_plus_days_inr: sum(st.ap.filter(i => i.msme && (w - i.issued) * 7 >= 35), i => i.amount),
    inventory_units: st.inv.units, inventory_incoming_units: incomingUnits(st),
    expected_weekly_demand_units: Math.round(demand),
    weeks_of_stock_cover: +((st.inv.units + incomingUnits(st)) / demand).toFixed(2),
    unit_price_inr: s.price, unit_cost_inr: Math.round(s.unit_cost * st.costMult),
    gst_payable_inr: st.gstPayable,
    weeks_since_maintenance: w - st.maint.last,
    payroll_and_fixed_costs_per_week_inr: s.payroll_per_week + s.fixed_cost_per_week,
  };
}

/* ------------------------------------------------------------------ the proposers */
const IMPACT = { // what an agent would claim the cash effect within the horizon is, as a share of the amount
  accept_bulk_order: 0, extend_credit_terms: -0.5, clear_stock_discount: 0.85,
  place_reorder: 0, prepay_supplier_discount: -1,
  schedule_overtime: -1, schedule_maintenance: -1,
  send_dunning: 0.6, early_payment_discount: 0.69, factor_invoices: 0.96,
  draw_overdraft: 1, repay_overdraft: -1, delay_payables: 1, pay_payables_early: -0.985,
  settle_msme_overdue: -1, pay_gst_dues: -1,
};

export function mockPropose(deptKey, st, p, seed = 0) {
  const s = p.sim, w = st.week, H = s.horizon_weeks, v = stateSummary(st, p);
  const rnd = stream(mix(seed, w, deptKey));
  const agent = DECISION_DEPTS.find(d => d.key === deptKey).agent.id;
  const out = [];
  const add = (type, amount, conf, why, dt = 0) => {
    amount = k1000(amount); if (!(amount > 0)) return;
    out.push({ agent, action_type: type, amount_inr: amount, timing_week: Math.min(w + H - 1, w + dt),
      cash_impact_inr: Math.round(amount * IMPACT[type]),
      confidence: Math.max(0.05, Math.min(0.99, +(conf + (rnd() - 0.5) * 0.12).toFixed(2))), rationale: why });
  };
  const jit = () => 0.9 + rnd() * 0.2;
  const buffer = p.constraints.min_cash_buffer, cover = v.weeks_of_stock_cover, demand = v.expected_weekly_demand_units;

  switch (deptKey) {
    case 'sales':
      if (cover > 1.2 && rnd() < 0.75) add('accept_bulk_order', Math.min(v.inventory_units * 0.4, 700) * s.price * jit(), 0.75, 'A distributor wants a bulk lot and we have the stock; it is on 30-day credit.');
      if (v.receivables_not_yet_due_inr < 4.5 * demand * s.price && rnd() < 0.6) add('extend_credit_terms', v.receivables_not_yet_due_inr * 0.25 * jit(), 0.55, 'Two large customers will place bigger orders if we extend their terms by two weeks.');
      if (cover > 3.5) add('clear_stock_discount', v.inventory_units * 0.2 * s.price * 0.85 * jit(), 0.6, 'Stock cover is high; a 15% discount clears the slow lines.');
      break;
    case 'procurement': {
      const need = Math.max(0, 5 * demand - v.inventory_units - v.inventory_incoming_units);
      if (need > 0) {
        const amt = need * v.unit_cost_inr * jit();
        add('place_reorder', amt, 0.85, `Cover is ${cover} weeks against a 5-week target; reorder on supplier credit.`, 0);
        if (w % 2 === 0 && rnd() < 0.6) add('prepay_supplier_discount', amt * 0.35, 0.5, 'The supplier gives 3% for prepayment on this lot.');
      }
      break;
    }
    case 'production':
      if (cover < 2.5) add('schedule_overtime', 250000 * jit(), 0.65, 'Cover is thin; overtime on the line adds units next week.');
      if (v.weeks_since_maintenance >= s.maintenance_interval_weeks - 2) add('schedule_maintenance', 150000 * jit(), 0.9, `${v.weeks_since_maintenance} weeks since the last service; a breakdown is likely if it slips.`);
      else if (rnd() < 0.15) add('schedule_maintenance', 100000 * jit(), 0.4, 'Routine servicing while the line is quiet.');
      break;
    case 'collections':
      if (v.receivables_overdue_inr > 0) add('send_dunning', v.receivables_overdue_inr * jit(), 0.7, 'Invoices are past due; dunning notices should bring most of them in this week.');
      if (rnd() < 0.6 && v.receivables_not_yet_due_inr > 0) add('early_payment_discount', v.receivables_not_yet_due_inr * 0.3 * jit(), 0.5, 'A 2% early-payment discount pulls cash forward from good customers.');
      if (st.cash < 2.5 * buffer && v.receivables_not_yet_due_inr > 0) add('factor_invoices', v.receivables_not_yet_due_inr * 0.4 * jit(), 0.6, 'Cash is tight; factoring the furthest-out invoices releases it now.');
      break;
    case 'treasury': {
      const minProj = Math.min(...v.projected_cash_inr_next_weeks);
      const headroom = Math.max(0, st.od.limit - st.od.used);
      if (minProj < 1.5 * buffer && headroom > 0) add('draw_overdraft', Math.min(headroom, (1.5 * buffer - minProj) * 1.2 * jit()), 0.8, `Projected cash falls to Rs ${Math.round(minProj).toLocaleString('en-IN')}; draw the overdraft to stay above the buffer.`);
      if (st.cash > 3 * buffer && st.od.used > 0) add('repay_overdraft', Math.min(st.od.used, st.cash - 2 * buffer), 0.6, 'Cash is comfortable; repay overdraft to save interest.');
      if ((minProj < 1.5 * buffer || rnd() < 0.3) && v.payables_due_within_1_week_inr > 0) add('delay_payables', v.payables_due_within_1_week_inr * 0.5 * jit(), 0.6, 'Push this week\'s supplier payments out two weeks to protect cash.');
      if (st.cash > 4 * buffer && v.payables_total_inr > 0) add('pay_payables_early', v.payables_total_inr * 0.2, 0.4, 'Surplus cash can earn a 1.5% early-payment discount.');
      break;
    }
    case 'compliance':
      if (v.msme_payables_aged_35_plus_days_inr > 0) add('settle_msme_overdue', v.msme_payables_aged_35_plus_days_inr, 0.9, 'MSME supplier invoices are approaching the 45-day limit; pay them to avoid statutory interest.');
      if (v.gst_payable_inr > 0 && w % s.gst_every_weeks === s.gst_every_weeks - 2) add('pay_gst_dues', v.gst_payable_inr, 0.7, 'File and pay GST ahead of the month-end date.');
      break;
  }
  return out.slice(0, 3);
}

/**
 * One decision cycle's proposals from all six departments. A proposal that fails the schema is
 * dropped and reported in `failures` (it never reaches the Arbiter).
 * Returns { proposals, failures }.
 */
export function proposeAll({ state, p, seed = 0 }) {
  const proposals = [], failures = [];
  for (const d of DECISION_DEPTS) {
    const ctx = { agentId: d.agent.id, allowed: actionsOf(d.key), week: state.week, horizon: p.sim.horizon_weeks };
    for (const pr of mockPropose(d.key, state, p, seed)) {
      const v = validateProposal(pr, ctx);
      if (v.ok) proposals.push(v.value); else failures.push({ dept: d.key, errors: v.errors });
    }
  }
  return { proposals, failures };
}
