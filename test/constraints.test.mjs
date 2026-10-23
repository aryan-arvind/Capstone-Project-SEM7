import test from 'node:test';
import assert from 'node:assert/strict';
import { PARAMS as p } from '../msme/params.mjs';
import { initState } from '../msme/sim.mjs';
import { check, realizedViolations, totalMagnitude, CONSTRAINTS } from '../msme/constraints.mjs';

let n = 0;
const prop = (action_type, amount_inr, timing_week = 0) => ({ agent: 'a' + n++, action_type, amount_inr, timing_week, cash_impact_inr: 0, confidence: 0.8, rationale: 'x' });
const world = (seed = 3) => initState(seed, 'baseline', p);
const kinds = v => new Set(v.map(x => x.constraint));

test('an empty proposal set on the opening books has no violations', () => {
  assert.deepEqual(check([], world(), p), []);
});

test('check is pure: same input, same output, state untouched', () => {
  const st = world(), before = JSON.stringify(st), set = [prop('schedule_overtime', 900000)];
  const a = check(set, st, p), b = check(set, st, p);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(st), before);
});

test('MIN_CASH_BUFFER: spending that takes cash under the buffer is caught', () => {
  const v = check([prop('schedule_overtime', 1_100_000)], world(), p);
  assert.ok(kinds(v).has('MIN_CASH_BUFFER'));
  assert.ok(v.find(x => x.constraint === 'MIN_CASH_BUFFER').magnitude_inr > 0);
});

test('MIN_CASH_BUFFER: a small spend that stays above the buffer is fine', () => {
  assert.ok(!kinds(check([prop('schedule_maintenance', 100_000)], world(), p)).has('MIN_CASH_BUFFER'));
});

test('OD_LIMIT: drawing more than the limit is caught, and a tightened limit is respected', () => {
  const st = world();
  assert.ok(kinds(check([prop('draw_overdraft', p.sim.opening.od_limit + 100_000)], st, p)).has('OD_LIMIT'));
  assert.ok(!kinds(check([prop('draw_overdraft', 500_000)], st, p)).has('OD_LIMIT'));
  st.od.limit = 300_000;
  assert.ok(kinds(check([prop('draw_overdraft', 500_000)], st, p)).has('OD_LIMIT'));
});

test('COVENANT_RATIO: a current ratio under the covenant is caught', () => {
  const st = world();
  st.ar = []; st.inv.units = 0; st.cash = 400_000;
  st.ap = [{ id: 'x', amount: 900_000, issued: 0, due: 9, msme: false }];
  assert.ok(kinds(check([], st, p)).has('COVENANT_RATIO'));
});

test('PAYMENT_TERM: delaying MSME supplier payments past 45 days is caught; delaying non-MSME ones is not', () => {
  const st = world();
  st.ap = [{ id: 'm', amount: 700_000, issued: -5, due: 1, msme: true }];
  assert.ok(kinds(check([prop('delay_payables', 700_000)], st, p)).has('PAYMENT_TERM'));
  st.ap = [{ id: 'n', amount: 700_000, issued: -5, due: 1, msme: false }];
  assert.ok(!kinds(check([prop('delay_payables', 700_000)], st, p)).has('PAYMENT_TERM'));
});

test('PAYMENT_TERM is configurable', () => {
  const st = world();
  st.ap = [{ id: 'm', amount: 700_000, issued: -5, due: 1, msme: true }];
  const loose = structuredClone(p);
  loose.constraints.payment_term_days = 90;
  assert.ok(!kinds(check([prop('delay_payables', 700_000)], st, loose)).has('PAYMENT_TERM'));
});

test('INVENTORY_CAPACITY: ordering past the warehouse limit is caught', () => {
  const st = world();
  assert.ok(kinds(check([prop('place_reorder', 4_000_000)], st, p)).has('INVENTORY_CAPACITY'));
  assert.ok(!kinds(check([prop('place_reorder', 1_000_000)], st, p)).has('INVENTORY_CAPACITY'));
});

test('a proposal that fixes a problem removes the violation', () => {
  const st = world();
  st.cash = 150_000;
  assert.ok(kinds(check([], st, p)).has('MIN_CASH_BUFFER'));
  assert.ok(!kinds(check([prop('draw_overdraft', 1_800_000)], st, p)).has('MIN_CASH_BUFFER'));
});

test('realizedViolations applies the same rules to the actual books', () => {
  const st = world();
  st.cash = 10_000;
  assert.ok(kinds(realizedViolations(st, p)).has('MIN_CASH_BUFFER'));
});

test('every violation names a known constraint and a positive magnitude', () => {
  const v = check([prop('schedule_overtime', 1_100_000), prop('place_reorder', 4_000_000)], world(), p);
  for (const x of v) {
    assert.ok(CONSTRAINTS.includes(x.constraint));
    assert.ok(x.magnitude_inr > 0);
    assert.equal(typeof x.detail, 'string');
  }
  assert.ok(totalMagnitude(v) > 0);
});
