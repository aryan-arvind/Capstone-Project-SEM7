// The actions a department agent may propose, what each does to the books, and what it is worth.
//
// apply(state, amount, ctx)  - mutates the state at the week the action executes
// value(amount, state, p)    - { profit, risk }: the expected economics the Arbiter's objective uses
//
// Both read the same parameters (config/params.json "effects"), so the simulator and the Arbiter
// cannot disagree about what an action does. Amounts are integer INR. These effect models are
// modelling assumptions, documented in the README.
import { addAR, addAP, takeAR, takeAP, arTotal, apTotal, incomingUnits, sum, round } from './books.mjs';

const margin = p => p.sim.price - p.sim.unit_cost;
const horizonDemand = (st, p) => p.sim.base_demand_units * st.demandMult * p.sim.horizon_weeks;
const shortfallUnits = (st, p) => Math.max(0, horizonDemand(st, p) - st.inv.units - incomingUnits(st));
const weekRate = p => p.sim.od_rate_annual / 52;
const byDue = (a, b) => a.due - b.due || a.id.localeCompare(b.id);

export const ACTIONS = {
  // ---------------------------------------------------------------- sales
  accept_bulk_order: {
    dept: 'sales', label: 'accept a bulk order',
    apply(st, a, c) {
      const units = Math.floor(a / c.p.sim.price), give = Math.min(units, st.inv.units);
      st.stats.stockoutUnits += units - give; if (give <= 0) return;
      st.inv.units -= give;
      const rev = give * c.p.sim.price;
      addAR(st, rev, st.week + c.p.sim.customer_credit_weeks, c.noise.lag, c.expected, c.p);
      st.gstPayable += round(rev * c.p.sim.gst_rate_of_sales);
      st.stats.revenue += rev; st.stats.cogs += give * c.p.sim.unit_cost;
    },
    value: (a, st, p) => ({ profit: margin(p) * Math.min(Math.floor(a / p.sim.price), st.inv.units), risk: 0 }),
  },
  extend_credit_terms: {
    dept: 'sales', label: 'extend customer credit terms',
    apply(st, a, c) {
      const w = c.p.effects.extend_credit_weeks;
      const taken = takeAR(st, a, byDue, i => i.due >= st.week - 1);
      for (const t of taken) st.ar.push({ ...t.inv, id: 'AR' + (++st.seq), amount: t.take, due: t.inv.due + w, pay: t.inv.pay + w, exp: t.inv.exp + w });
      const uplift = round(sum(taken, t => t.take) * c.p.effects.extend_credit_uplift);
      if (uplift > 0) { addAR(st, uplift, st.week + c.p.sim.customer_credit_weeks + w, c.noise.lag, c.expected, c.p); st.stats.revenue += uplift; }
    },
    value: (a, st, p) => ({ profit: a * p.effects.extend_credit_uplift, risk: 0 }),
  },
  clear_stock_discount: {
    dept: 'sales', label: 'clear stock at a discount',
    apply(st, a, c) {
      const unitPrice = c.p.sim.price * (1 - c.p.effects.stock_discount);
      const units = Math.min(Math.floor(a / unitPrice), st.inv.units); if (units <= 0) return;
      const cash = round(units * unitPrice);
      st.inv.units -= units; st.cash += cash; st.gstPayable += round(cash * c.p.sim.gst_rate_of_sales);
      st.stats.revenue += cash; st.stats.cogs += units * c.p.sim.unit_cost;
    },
    value: (a, st, p) => { const u = Math.min(Math.floor(a / (p.sim.price * (1 - p.effects.stock_discount))), st.inv.units); return { profit: -u * p.sim.price * p.effects.stock_discount, risk: 0 }; },
  },
  // ---------------------------------------------------------------- procurement
  place_reorder: {
    dept: 'procurement', label: 'reorder stock on supplier credit',
    apply(st, a, c) {
      const units = Math.floor(a / (c.p.sim.unit_cost * st.costMult)); if (units <= 0) return;
      const arrive = st.week + c.p.sim.reorder_lead_weeks;
      st.inv.incoming.push({ week: arrive, units });
      addAP(st, units * c.p.sim.unit_cost * st.costMult, arrive, c.noise.msme, c.p);
    },
    value: (a, st, p) => { const u = Math.floor(a / (p.sim.unit_cost * st.costMult)); return { profit: margin(p) * Math.min(u, shortfallUnits(st, p)) - (p.sim.unit_cost * st.costMult - p.sim.unit_cost) * u, risk: 0 }; },
  },
  prepay_supplier_discount: {
    dept: 'procurement', label: 'prepay a supplier for a discount',
    apply(st, a, c) {
      const units = Math.floor(a / (c.p.sim.unit_cost * st.costMult * (1 - c.p.effects.prepay_discount))); if (units <= 0) return;
      st.cash -= a; st.inv.incoming.push({ week: st.week + c.p.sim.reorder_lead_weeks, units });
    },
    value: (a, st, p) => { const u = Math.floor(a / (p.sim.unit_cost * st.costMult * (1 - p.effects.prepay_discount))); return { profit: margin(p) * Math.min(u, shortfallUnits(st, p)) + p.effects.prepay_discount * a - (p.sim.unit_cost * st.costMult - p.sim.unit_cost) * u, risk: 0 }; },
  },
  // ---------------------------------------------------------------- production
  schedule_overtime: {
    dept: 'production', label: 'schedule overtime',
    apply(st, a, c) {
      const units = Math.floor(a / (c.p.sim.unit_cost * c.p.effects.overtime_cost_share_of_unit_cost)); if (units <= 0) return;
      st.cash -= a; st.inv.incoming.push({ week: st.week + 1, units });
    },
    value: (a, st, p) => { const u = Math.floor(a / (p.sim.unit_cost * p.effects.overtime_cost_share_of_unit_cost)); return { profit: Math.min(u, shortfallUnits(st, p)) * p.sim.price - a, risk: 0 }; },
  },
  schedule_maintenance: {
    dept: 'production', label: 'schedule machine maintenance',
    apply(st, a, c) { st.cash -= a; st.maint.last = st.week; },
    value: (a, st, p) => ({ profit: 0, risk: (st.week - st.maint.last >= p.sim.maintenance_interval_weeks ? p.sim.breakdown_prob_when_overdue : 0.05) * p.sim.breakdown_cost }),
  },
  // ---------------------------------------------------------------- collections
  send_dunning: {
    dept: 'collections', label: 'send dunning notices',
    apply(st, a, c) {
      const taken = takeAR(st, a, byDue, i => i.due <= st.week);
      let got = 0;
      for (const t of taken) {
        const paid = round(t.take * c.p.effects.dunning_collect_rate); got += paid;
        if (t.take - paid > 0) st.ar.push({ ...t.inv, id: 'AR' + (++st.seq), amount: t.take - paid });
      }
      st.cash += got - round(sum(taken, t => t.take) * c.p.effects.dunning_cost);
    },
    value: (a, st, p) => ({ profit: -a * p.effects.dunning_cost, risk: 0 }),
  },
  early_payment_discount: {
    dept: 'collections', label: 'offer an early-payment discount',
    apply(st, a, c) {
      const taken = takeAR(st, a, byDue, i => i.due > st.week);
      let got = 0;
      for (const t of taken) {
        const accepted = round(t.take * c.p.effects.early_payment_take_up);
        got += round(accepted * (1 - c.p.effects.early_payment_discount));
        if (t.take - accepted > 0) st.ar.push({ ...t.inv, id: 'AR' + (++st.seq), amount: t.take - accepted });
      }
      st.cash += got; st.stats.discounts += round(sum(taken, t => t.take) * c.p.effects.early_payment_take_up * c.p.effects.early_payment_discount);
    },
    value: (a, st, p) => ({ profit: -a * p.effects.early_payment_take_up * p.effects.early_payment_discount, risk: 0 }),
  },
  factor_invoices: {
    dept: 'collections', label: 'factor invoices',
    apply(st, a, c) {
      const taken = takeAR(st, a, (x, y) => y.due - x.due || x.id.localeCompare(y.id), i => i.due > st.week); // furthest-out first
      const face = sum(taken, t => t.take);
      st.cash += round(face * (1 - c.p.effects.factoring_fee)); st.stats.factoringFees += round(face * c.p.effects.factoring_fee);
    },
    value: (a, st, p) => ({ profit: -a * p.effects.factoring_fee, risk: 0 }),
  },
  // ---------------------------------------------------------------- treasury
  draw_overdraft: {
    dept: 'treasury', label: 'draw on the overdraft',
    apply(st, a) { st.cash += a; st.od.used += a; },
    value: (a, st, p) => ({ profit: -a * weekRate(p) * p.sim.horizon_weeks, risk: 0 }),
  },
  repay_overdraft: {
    dept: 'treasury', label: 'repay the overdraft',
    apply(st, a) { const r = Math.min(a, st.od.used); st.cash -= r; st.od.used -= r; },
    value: (a, st, p) => ({ profit: a * weekRate(p) * p.sim.horizon_weeks, risk: 0 }),
  },
  delay_payables: {
    dept: 'treasury', label: 'delay supplier payments',
    apply(st, a, c) {
      const w = c.p.effects.delay_payables_weeks;
      const taken = takeAP(st, a, byDue, i => i.due <= st.week + 1);
      for (const t of taken) st.ap.push({ ...t.inv, id: 'AP' + (++st.seq), amount: t.take, due: t.inv.due + w });
    },
    value: (a, st, p) => ({ profit: a * weekRate(p) * p.effects.delay_payables_weeks, risk: 0 }),
  },
  pay_payables_early: {
    dept: 'treasury', label: 'pay suppliers early for a discount',
    apply(st, a, c) {
      const retire = round(a / (1 - c.p.effects.pay_early_discount));
      const taken = takeAP(st, retire, (x, y) => y.due - x.due || x.id.localeCompare(y.id), i => i.due > st.week);
      const face = sum(taken, t => t.take);
      st.cash -= round(face * (1 - c.p.effects.pay_early_discount)); st.stats.discounts -= round(face * c.p.effects.pay_early_discount);
    },
    value: (a, st, p) => ({ profit: a * p.effects.pay_early_discount / (1 - p.effects.pay_early_discount), risk: 0 }),
  },
  // ---------------------------------------------------------------- compliance
  settle_msme_overdue: {
    dept: 'compliance', label: 'settle MSME supplier invoices before the 45-day limit',
    apply(st, a, c) {
      const taken = takeAP(st, a, (x, y) => x.issued - y.issued || x.id.localeCompare(y.id), i => i.msme);
      st.cash -= sum(taken, t => t.take);
    },
    value: (a, st, p) => ({ profit: 0, risk: a * p.sim.msme_late_interest_multiple * weekRate(p) * p.sim.horizon_weeks }),
  },
  pay_gst_dues: {
    dept: 'compliance', label: 'pay GST dues early',
    apply(st, a) { const r = Math.min(a, st.gstPayable); st.cash -= r; st.gstPayable -= r; },
    value: (a) => ({ profit: 0, risk: a * 0.002 }),
  },
};

export const ACTION_TYPES = Object.keys(ACTIONS);
export const DEPT_OF = Object.fromEntries(ACTION_TYPES.map(t => [t, ACTIONS[t].dept]));
export const actionsOf = dept => ACTION_TYPES.filter(t => ACTIONS[t].dept === dept);

/** Pairs of action types that contradict each other when both run in the same week. */
export const CONTRADICTIONS = [
  ['draw_overdraft', 'repay_overdraft'],
  ['delay_payables', 'pay_payables_early'],
  ['delay_payables', 'settle_msme_overdue'],
  ['place_reorder', 'prepay_supplier_discount'],
  ['clear_stock_discount', 'place_reorder'],
  ['early_payment_discount', 'factor_invoices'],
];
