import test from 'node:test';
import assert from 'node:assert/strict';
import { PARAMS as p } from '../msme/params.mjs';
import { initState, step, project, clone, metrics, SCENARIOS, schedule } from '../msme/sim.mjs';

const run = (seed, scenario, weeks = 12) => { const st = initState(seed, scenario, p); for (let w = 0; w < weeks; w++) step(st, { p }); return st; };

test('the same seed gives byte-identical results, for every scenario', () => {
  for (const sc of SCENARIOS) assert.equal(JSON.stringify(run(11, sc)), JSON.stringify(run(11, sc)), sc);
});

test('different seeds give different worlds', () => {
  assert.notEqual(JSON.stringify(run(1, 'baseline')), JSON.stringify(run(2, 'baseline')));
});

test('common random numbers: the noise table does not depend on the scenario', () => {
  assert.deepEqual(initState(5, 'baseline', p).noise, initState(5, 'demand_surge', p).noise);
});

test('look-ahead (project) never changes the real state', () => {
  const st = initState(3, 'baseline', p); const before = JSON.stringify(st);
  project(st, [{ week: 0, type: 'draw_overdraft', amount: 500000, agent: 'x' }], 4, p);
  assert.equal(JSON.stringify(st), before);
});

test('look-ahead cannot see a scenario shock that has not happened yet', () => {
  const a = initState(3, 'baseline', p), b = initState(3, 'demand_surge', p);
  assert.deepEqual(project(a, [], 4, p), project(b, [], 4, p));
});

test('delayed_receivable moves only the true payment week, not the forecast', () => {
  const st = initState(4, 'delayed_receivable', p);
  for (let w = 0; w <= p.scenarios.event_week; w++) step(st, { p });
  assert.ok(st.ar.some(i => i.pay - i.exp >= p.scenarios.delayed_receivable.delay_weeks - 1));
});

test('credit_limit_tightened cuts the overdraft limit', () => {
  const st = run(4, 'credit_limit_tightened', p.scenarios.event_week + 1);
  assert.equal(st.od.limit, Math.round(p.sim.opening.od_limit * p.scenarios.credit_limit_tightened.limit_multiplier));
});

test('an approved overdraft draw adds cash and debt', () => {
  const st = initState(9, 'baseline', p); const c0 = st.cash;
  schedule(st, { timing_week: 0, action_type: 'draw_overdraft', amount_inr: 400000, agent: 't' });
  const r = step(st, { p });
  assert.equal(st.od.used, 400000);
  assert.ok(st.cash > c0 + 400000 - 1e6 && r.actions.length === 1);
});

test('metrics are finite numbers', () => {
  const st = run(6, 'baseline', 6); const m = metrics(st, p);
  for (const v of Object.values(m)) assert.ok(Number.isFinite(v));
});
