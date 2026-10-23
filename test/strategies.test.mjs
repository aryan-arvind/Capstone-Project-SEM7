import test from 'node:test';
import assert from 'node:assert/strict';
import { PARAMS as p } from '../msme/params.mjs';
import { initState, SCENARIOS } from '../msme/sim.mjs';
import { proposeAll } from '../msme/agents.mjs';
import { decide, STRATEGIES } from '../msme/strategies.mjs';
import { runCycle, runEpisode } from '../msme/episode.mjs';
import { runExperiment, applyOverrides, toCsv } from '../msme/run.mjs';
import { check } from '../msme/constraints.mjs';
import { summarize, paired } from '../msme/stats.mjs';

const prop = (agent, action_type, amount_inr, o = {}) => ({ agent, action_type, amount_inr, timing_week: 0, cash_impact_inr: 0, confidence: 0.8, rationale: 'x', ...o });

test('smoke: one full decision cycle per strategy, same proposals in', async () => {
  for (const strategy of STRATEGIES) {
    const st = initState(2, 'baseline', p);
    const c = runCycle({ st, strategy, p, seed: 2 });
    assert.ok(c.proposals.length > 0, strategy);
    assert.equal(c.decision.decisions.length, c.proposals.length, strategy);
    assert.equal(st.week, 1, 'the week advanced');
    for (const d of c.decision.decisions) assert.ok(['approved', 'modified', 'rejected'].includes(d.outcome) && d.reason, strategy);
  }
});

test('all strategies see identical proposals at week 0 of the same seed', async () => {
  const a = proposeAll({ state: initState(5, 'baseline', p), p, seed: 5 });
  const b = proposeAll({ state: initState(5, 'baseline', p), p, seed: 5 });
  assert.deepEqual(a.proposals, b.proposals);
});

test('no arbiter: everything is executed exactly as proposed', () => {
  const st = initState(2, 'baseline', p);
  const asks = [prop('prod_agent', 'schedule_overtime', 900_000), prop('treas_agent', 'pay_payables_early', 900_000)];
  const r = decide('independent', asks, st, p);
  assert.equal(r.executed.length, 2);
  assert.ok(r.decisions.every(d => d.outcome === 'approved' && d.amount_approved_inr === d.amount_requested_inr));
  assert.ok(r.violations_predicted.length > 0, 'and it does break the buffer');
});

test('priority vote: ranks by priority x confidence, drops contradictions and overdrafts, but is blind to the buffer', () => {
  const st = initState(2, 'baseline', p); st.od.used = 500_000;
  const asks = [prop('treas_agent', 'draw_overdraft', 400_000, { cash_impact_inr: 400_000, confidence: 0.9 }), prop('treas_agent', 'repay_overdraft', 400_000, { cash_impact_inr: -400_000, confidence: 0.5 })];
  const r = decide('priority_vote', asks, st, p);
  assert.deepEqual(r.executed.map(e => e.action_type), ['draw_overdraft']);
  assert.match(r.decisions.find(d => d.action_type === 'repay_overdraft').reason, /contradicts/);
  const big = decide('priority_vote', [prop('prod_agent', 'schedule_overtime', 1_300_000, { cash_impact_inr: -1_300_000 })], initState(2, 'baseline', p), p);
  assert.equal(big.executed.length, 1, 'still affordable by the bank balance, so it passes');
  assert.ok(big.violations_predicted.some(v => v.constraint === 'MIN_CASH_BUFFER'), 'yet it breaks the buffer');
});

test('constraint-aware: the executed set is feasible where the baselines are not', () => {
  const st = initState(2, 'baseline', p);
  const asks = [prop('prod_agent', 'schedule_overtime', 1_300_000, { cash_impact_inr: -1_300_000 })];
  assert.equal(decide('constraint_aware', asks, st, p).violations_predicted.length, 0);
});

test('an episode is deterministic and reports every headline metric', async () => {
  const a = runEpisode({ seed: 3, scenario: 'demand_surge', strategy: 'constraint_aware', p });
  const b = runEpisode({ seed: 3, scenario: 'demand_surge', strategy: 'constraint_aware', p });
  assert.deepEqual(a.row, b.row);
  for (const k of ['violation_rate', 'min_cash_inr', 'stockout_units', 'ccc_days', 'ending_cash_inr']) assert.ok(Number.isFinite(a.row[k]), k);
  assert.equal(a.weekly.length, p.sim.episode_weeks);
});

test('the experiment shares seeds across strategies and exports csv and summaries', async () => {
  const r = await runExperiment({ seeds: 2, scenarios: ['baseline', 'demand_surge'], strategies: STRATEGIES, weeks: 6 });
  assert.equal(r.rows.length, 2 * 2 * 3);
  const csv = toCsv(r.rows).trim().split('\n');
  assert.equal(csv.length, r.rows.length + 1);
  assert.ok(csv[0].includes('violation_rate') && csv[0].includes('profit_inr'));
  assert.equal(r.summary.length, 2 * 3);
  const w1 = r.weekly.filter(w => w.seed === 1 && w.scenario === 'baseline' && w.week === 0);
  assert.equal(w1.length, 3);
  assert.equal(r.comparisons.baseline.independent.violation_rate.pairs, 2);
});

test('parameter overrides reach the run, and unknown names are refused', () => {
  const q = applyOverrides(p, ['objective.w_liquidity=2', 'constraints.stress_largest_receivable_delay_weeks=3']);
  assert.equal(q.objective.w_liquidity, 2); assert.equal(q.constraints.stress_largest_receivable_delay_weeks, 3);
  assert.equal(p.objective.w_liquidity, 0.25, 'the original is untouched');
  assert.throws(() => applyOverrides(p, ['objective.nope=1']));
});

test('the stress margin makes the look-ahead more pessimistic', () => {
  const st = initState(4, 'baseline', p);
  const q = applyOverrides(p, ['constraints.stress_largest_receivable_delay_weeks=4']);
  const heavy = [prop('prod_agent', 'schedule_overtime', 800_000), prop('comp_agent', 'pay_gst_dues', 300_000)];
  assert.ok(check(heavy, st, q).length >= check(heavy, st, p).length);
});

test('paired comparison and summary statistics', () => {
  const rows = [1, 2, 3, 4].flatMap(seed => [
    { seed, scenario: 's', strategy: 'constraint_aware', violation_rate: 0.1, min_cash_inr: 5, stockout_units: 1, ccc_days: 1, ending_cash_inr: 1, ending_net_worth_inr: 1, profit_inr: 1 },
    { seed, scenario: 's', strategy: 'independent', violation_rate: 0.5 + seed / 100, min_cash_inr: 1, stockout_units: 1, ccc_days: 1, ending_cash_inr: 1, ending_net_worth_inr: 1, profit_inr: 1 }]);
  const d = paired(rows, 's', 'constraint_aware', 'independent').violation_rate;
  assert.equal(d.pairs, 4); assert.equal(d.wins_a, 4); assert.ok(d.mean < 0 && d.ci95[1] < 0);
  assert.equal(summarize(rows).length, 2);
});
