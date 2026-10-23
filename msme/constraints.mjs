// The constraint layer. Deterministic code, no model, no randomness.
//
//   check(proposalSet, state, p)   -> violations[]   (pure: looks ahead on a copy, never touches `state`)
//   realizedViolations(state, p)   -> violations[]   (the same rules applied to the books as they actually are)
//
// The five hard constraints, all configurable in config/params.json:
//   MIN_CASH_BUFFER     cash never below the minimum buffer
//   OD_LIMIT            overdraft drawn never above the (possibly tightened) limit
//   COVENANT_RATIO      current ratio (cash + receivables + stock) / (payables + overdraft + GST) at least the covenant
//   PAYMENT_TERM        no MSME supplier invoice left unpaid beyond the statutory payment term (45 days)
//   INVENTORY_CAPACITY  stock on hand plus stock on order never above the warehouse capacity
//
// `check` looks `horizon_weeks` ahead in expected-value mode with the proposals applied. A violation
// is {constraint, week, detail, magnitude_inr}: how much money (or stock value) short the rule is.
import { PARAMS } from './params.mjs';
import { project, schedule, clone } from './sim.mjs';
import { snapshot } from './books.mjs';

export const CONSTRAINTS = ['MIN_CASH_BUFFER', 'OD_LIMIT', 'COVENANT_RATIO', 'PAYMENT_TERM', 'INVENTORY_CAPACITY'];

const inr = n => 'Rs ' + Math.round(n).toLocaleString('en-IN');

/** The rules applied to one end-of-week snapshot. */
export function evaluateSnapshot(snap, p = PARAMS) {
  const c = p.constraints, out = [];
  const add = (constraint, detail, magnitude) => out.push({ constraint, week: snap.week, detail, magnitude_inr: Math.max(1, Math.round(magnitude)) });
  if (snap.cash < c.min_cash_buffer) add('MIN_CASH_BUFFER', `cash ${inr(snap.cash)} is below the ${inr(c.min_cash_buffer)} buffer`, c.min_cash_buffer - snap.cash);
  if (snap.odUsed > snap.odLimit) add('OD_LIMIT', `overdraft ${inr(snap.odUsed)} is above the ${inr(snap.odLimit)} limit`, snap.odUsed - snap.odLimit);
  if (snap.currentRatio < c.covenant_min_current_ratio) add('COVENANT_RATIO', `current ratio ${snap.currentRatio.toFixed(2)} is below the ${c.covenant_min_current_ratio} covenant`, c.covenant_min_current_ratio * snap.currentLiabilities - snap.currentAssets);
  if (snap.msmeOverdue > 0) add('PAYMENT_TERM', `${inr(snap.msmeOverdue)} owed to MSME suppliers is past the ${c.payment_term_days}-day payment term`, snap.msmeOverdue);
  if (snap.committedUnits > c.inventory_capacity_units) add('INVENTORY_CAPACITY', `${snap.committedUnits} units held or on order exceed the ${c.inventory_capacity_units}-unit capacity`, (snap.committedUnits - c.inventory_capacity_units) * p.sim.unit_cost);
  return out;
}

/** The look-ahead snapshots for a set of proposals (shared with the Arbiter's objective). */
export function lookahead(proposalSet, state, p = PARAMS) {
  const holder = { pending: [] };
  for (const pr of proposalSet) schedule(holder, pr);
  const k = p.constraints.stress_largest_receivable_delay_weeks || 0;
  let from = state;
  if (k > 0 && state.ar.length) { // pessimism margin: the largest customer pays k weeks later than forecast
    from = clone(state);
    const big = [...from.ar].sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id))[0];
    big.exp += k;
  }
  return project(from, holder.pending, p.sim.horizon_weeks, p);
}

export function check(proposalSet, state, p = PARAMS) {
  const out = [];
  for (const snap of lookahead(proposalSet, state, p)) out.push(...evaluateSnapshot(snap, p));
  return out;
}

export function realizedViolations(state, p = PARAMS) {
  return evaluateSnapshot(snapshot(state, p), p);
}

export const totalMagnitude = violations => violations.reduce((s, v) => s + v.magnitude_inr, 0);
export const summarise = violations => Object.fromEntries(CONSTRAINTS.map(k => [k, violations.filter(v => v.constraint === k).length]));
