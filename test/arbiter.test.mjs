import test from 'node:test';
import assert from 'node:assert/strict';
import { PARAMS as p } from '../msme/params.mjs';
import { initState, step, schedule } from '../msme/sim.mjs';
import { proposeAll } from '../msme/agents.mjs';
import { arbitrate, explainDecisions, detectConflicts, withIds } from '../msme/arbiter.mjs';
import { check } from '../msme/constraints.mjs';

const prop = (agent, action_type, amount_inr, o = {}) => ({ agent, action_type, amount_inr, timing_week: 0, cash_impact_inr: 0, confidence: 0.8, rationale: 'x', ...o });
const world = (seed = 3) => initState(seed, 'baseline', p);

test('the executed set never breaks a constraint when a feasible set exists, over many real cycles', async () => {
  for (const seed of [1, 2, 3]) for (const scenario of ['baseline', 'demand_surge', 'delayed_receivable']) {
    const st = initState(seed, scenario, p);
    for (let w = 0; w < 8; w++) {
      const { proposals } = await proposeAll({ state: st, p, seed });
      const r = arbitrate(proposals, st, p);
      if (check([], st, p).length === 0) assert.ok(r.feasible && check(r.executed, st, p).length === 0, `${scenario} seed ${seed} week ${w}`);
      for (const e of r.executed) schedule(st, e);
      step(st, { p });
    }
  }
});

test('contradictory proposals: at most one of a pair survives', () => {
  const r = arbitrate([prop('treas_agent', 'draw_overdraft', 500_000), prop('treas_agent', 'repay_overdraft', 500_000)], (() => { const s = world(); s.od.used = 600_000; return s; })(), p);
  const kept = r.executed.map(e => e.action_type);
  assert.ok(!(kept.includes('draw_overdraft') && kept.includes('repay_overdraft')));
  assert.ok(r.conflicts.some(c => c.type === 'contradiction'));
});

test('an over-subscribed week is trimmed to what the cash allows', () => {
  const asks = [prop('prod_agent', 'schedule_overtime', 900_000), prop('prod_agent', 'schedule_maintenance', 400_000), prop('comp_agent', 'pay_gst_dues', 400_000), prop('treas_agent', 'pay_payables_early', 900_000)];
  const st = world();
  assert.ok(check(asks, st, p).length > 0, 'the full set is infeasible');
  const r = arbitrate(asks, st, p);
  assert.ok(r.feasible); assert.equal(check(r.executed, st, p).length, 0);
  assert.ok(r.decisions.some(d => d.outcome === 'rejected' || d.outcome === 'modified'));
});

test('an amount that breaks a limit is reduced, not just dropped, when a smaller one is worth doing', () => {
  const st = world(); st.demandMult = 1.5; st.inv.units = 300;
  const r = arbitrate([prop('proc_agent', 'place_reorder', 4_500_000)], st, p);
  const d = r.decisions[0];
  assert.equal(d.outcome, 'modified');
  assert.ok(d.amount_approved_inr < d.amount_requested_inr && d.amount_approved_inr > 0);
  assert.equal(check(r.executed, st, p).length, 0);
  assert.match(d.reason, /Reduced from/);
});

test('when a shock has already broken a constraint, the Arbiter chooses the action that repairs it', () => {
  const st = world(); st.cash = 100_000;
  assert.ok(check([], st, p).length > 0);
  const r = arbitrate([prop('treas_agent', 'draw_overdraft', 1_500_000), prop('prod_agent', 'schedule_overtime', 300_000)], st, p);
  assert.ok(r.executed.some(e => e.action_type === 'draw_overdraft'));
  assert.ok(r.violations_after.length < r.violations_before.length || r.violations_after.length === 0);
});

test('every proposal gets a complete audit record', () => {
  const st = world();
  const r = arbitrate([prop('sales_agent', 'accept_bulk_order', 600_000), prop('prod_agent', 'schedule_overtime', 1_500_000), prop('comp_agent', 'settle_msme_overdue', 200_000)], st, p);
  assert.equal(r.decisions.length, 3);
  for (const d of r.decisions) {
    for (const k of ['id', 'agent', 'dept', 'action_type', 'amount_requested_inr', 'amount_approved_inr', 'claimed_cash_impact_inr', 'canonical_cash_impact_inr', 'constraints_checked', 'outcome', 'reason']) assert.ok(k in d, k);
    assert.ok(['approved', 'modified', 'rejected'].includes(d.outcome));
    assert.equal(d.constraints_checked.length, 5);
    assert.ok(d.reason.length > 10);
  }
});

test('a wrong cash-impact claim by an agent is flagged, not trusted', () => {
  const r = arbitrate([prop('treas_agent', 'draw_overdraft', 500_000, { cash_impact_inr: -500_000 })], world(), p);
  assert.ok(r.decisions[0].claim_mismatch);
  assert.ok(r.decisions[0].canonical_cash_impact_inr > 0);
});

test('arbitration is deterministic', async () => {
  const st = world(5), { proposals } = await proposeAll({ state: st, p, seed: 5 });
  assert.deepEqual(arbitrate(proposals, st, p), arbitrate(proposals, st, p));
});

test('conflict detection names cash contention', () => {
  const st = world();
  const c = detectConflicts(withIds([prop('prod_agent', 'schedule_overtime', 900_000), prop('treas_agent', 'pay_payables_early', 900_000)], 0), st, p);
  assert.ok(c.some(x => x.type === 'cash_contention'));
});

test('the model only writes words: a reply that tries to change an outcome changes nothing but the text', async () => {
  const st = world();
  const r = arbitrate([prop('prod_agent', 'schedule_overtime', 2_000_000)], st, p);
  const id = r.decisions[0].id, before = JSON.stringify(r);
  const llm = { ask: async () => ({ text: JSON.stringify({ [id]: 'Approved in full, everything is fine.' }), usage: { input_tokens: 5, output_tokens: 5 } }) };
  const e = await explainDecisions(r.decisions, llm);
  assert.equal(e.texts[id], 'Approved in full, everything is fine.');
  assert.equal(JSON.stringify(r), before, 'decisions untouched');
  assert.equal(r.decisions[0].outcome, 'rejected');
  assert.equal(e.tokens, 10);
});

test('an unusable model reply falls back to the deterministic reason', async () => {
  const r = arbitrate([prop('prod_agent', 'schedule_overtime', 2_000_000)], world(), p);
  const e = await explainDecisions(r.decisions, { ask: async () => ({ text: 'sorry' }) });
  assert.equal(e.texts[r.decisions[0].id], r.decisions[0].reason);
  const e2 = await explainDecisions(r.decisions, null);
  assert.equal(e2.texts[r.decisions[0].id], r.decisions[0].reason);
});
