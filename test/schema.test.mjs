import test from 'node:test';
import assert from 'node:assert/strict';
import { PARAMS as p } from '../msme/params.mjs';
import { initState } from '../msme/sim.mjs';
import { validateProposal, validateReply, extractProposals, proposeWithRetry } from '../msme/schema.mjs';
import { mockPropose, proposeAll, buildPrompt } from '../msme/agents.mjs';
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

test('replies may be fenced, wrapped in {proposals}, a bare object, or an array', () => {
  const j = JSON.stringify(good);
  assert.equal(extractProposals('```json\n' + j + '\n```').length, 1);
  assert.equal(extractProposals(`{"proposals":[${j},${j}]}`).length, 2);
  assert.equal(extractProposals(`[${j}]`).length, 1);
  assert.ok(!validateReply('no json here', ctx).ok);
  assert.ok(!validateReply('{"proposals":[]}', ctx).ok);
  assert.ok(!validateReply(`{"proposals":[${[j, j, j, j].join(',')}]}`, ctx).ok, 'more than three');
});

test('malformed output is rejected and retried, then accepted', async () => {
  const replies = ['sorry, I cannot', '{"proposals":[{"agent":"treas_agent"}]}', JSON.stringify({ proposals: [good] })];
  let n = 0; const prompts = [];
  const ask = async (_s, u) => { prompts.push(u); return { text: replies[n++], usage: { input_tokens: 100, output_tokens: 20 } }; };
  const r = await proposeWithRetry({ ask, system: 's', user: 'u', ctx, maxRetries: 2 });
  assert.equal(r.attempts, 3); assert.equal(r.proposals.length, 1); assert.equal(r.tokens, 360);
  assert.match(prompts[2], /rejected/);
});

test('retries are bounded: after the last failure it gives up with no proposals', async () => {
  let n = 0; const ask = async () => { n++; return { text: 'nope' }; };
  const r = await proposeWithRetry({ ask, system: 's', user: 'u', ctx, maxRetries: 2 });
  assert.equal(n, 3); assert.equal(r.proposals.length, 0); assert.ok(r.errors.length);
});

test('a model that throws is retried too', async () => {
  let n = 0; const ask = async () => { if (++n < 3) throw new Error('timeout'); return { text: JSON.stringify(good) }; };
  assert.equal((await proposeWithRetry({ ask, system: 's', user: 'u', ctx, maxRetries: 2 })).proposals.length, 1);
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

test('proposeAll in mock mode makes no model calls', async () => {
  const r = await proposeAll({ state: initState(4, 'baseline', p), p, seed: 4 });
  assert.equal(r.calls, 0); assert.equal(r.tokens, 0); assert.ok(r.proposals.length > 0);
});

test('proposeAll in llm mode validates each department separately', async () => {
  const llm = { ask: async (sys) => {
    const m = /"agent":"(\w+)"/.exec(sys); const d = DECISION_DEPTS.find(x => x.agent.id === m[1]);
    const type = actionsOf(d.key)[0];
    return { text: JSON.stringify({ proposals: [{ agent: m[1], action_type: type, amount_inr: 100000, timing_week: 0, cash_impact_inr: -100000, confidence: 0.5, rationale: 'x' }] }), usage: { input_tokens: 10, output_tokens: 5 } };
  } };
  const r = await proposeAll({ state: initState(4, 'baseline', p), p, mode: 'llm', llm });
  assert.equal(r.proposals.length, 6); assert.equal(r.calls, 6); assert.equal(r.tokens, 90); assert.equal(r.failures.length, 0);
});

test('the prompt does not leak the hard constraints', () => {
  const { system, user } = buildPrompt('treasury', initState(1, 'baseline', p), p);
  assert.ok(!/covenant|45|buffer|current ratio/i.test(system + user));
});
