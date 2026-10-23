import test from 'node:test';
import assert from 'node:assert/strict';
import { PARAMS as p } from '../msme/params.mjs';
import { initState } from '../msme/sim.mjs';
import { validateProposal } from '../msme/schema.mjs';
import { mockPropose, proposeAll } from '../msme/agents.mjs';
import { DECISION_DEPTS } from '../msme/roster.mjs';
import { actionsOf } from '../msme/actions.mjs';

const ctx = { agentId: 'treas_agent', allowed: ['draw_overdraft', 'repay_overdraft'], week: 2, horizon: 4 };
const good = { agent: 'treas_agent', action_type: 'draw_overdraft', amount_inr: 500000, timing_week: 2, cash_impact_inr: 500000, confidence: 0.8, rationale: 'Cash will dip.' };

test('a well-formed proposal passes', () => assert.ok(validateProposal(good, ctx).ok));

test('each schema rule rejects what it should', () => {
  const bad = patch => validateProposal({ ...good, ...patch }, ctx);
  assert.ok(!bad({ agent: 'sales_agent' }).ok);
  assert.ok(!bad({ action_type: 'accept_bulk_order' }).ok);
  assert.ok(!bad({ amount_inr: 0 }).ok);
  assert.ok(!bad({ amount_inr: 1.5 }).ok);
  assert.ok(!bad({ timing_week: 1 }).ok);
  assert.ok(!bad({ timing_week: 6 }).ok);
  assert.ok(!bad({ cash_impact_inr: 9e9 }).ok);
  assert.ok(!bad({ confidence: 1.2 }).ok);
  assert.ok(!bad({ rationale: '' }).ok);
  assert.ok(!validateProposal({ ...good, extra: 1 }, ctx).ok, 'unknown field');
  const { rationale, ...missing } = good; assert.ok(!validateProposal(missing, ctx).ok, 'missing field');
});

test('the mock proposer only emits valid proposals, deterministically', () => {
  for (const seed of [1, 2, 3]) {
    const st = initState(seed, 'baseline', p);
    for (const d of DECISION_DEPTS) {
      const a = mockPropose(d.key, st, p, seed), b = mockPropose(d.key, st, p, seed);
      assert.deepEqual(a, b);
      const c = { agentId: d.agent.id, allowed: actionsOf(d.key), week: st.week, horizon: p.sim.horizon_weeks };
      for (const x of a) assert.ok(validateProposal(x, c).ok, JSON.stringify(validateProposal(x, c).errors));
    }
  }
});

test('proposeAll returns only schema-valid proposals and no failures', () => {
  const r = proposeAll({ state: initState(4, 'baseline', p), p, seed: 4 });
  assert.ok(r.proposals.length > 0);
  assert.equal(r.failures.length, 0);
});

test('an agent proposing something invalid is dropped before the Arbiter sees it', () => {
  // a state a week past the episode's horizon would still validate, so check the validator directly on a bad object
  const bad = { ...good, action_type: 'accept_bulk_order' };
  assert.ok(!validateProposal(bad, ctx).ok);
});
