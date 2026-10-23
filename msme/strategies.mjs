// The three ways the company can turn a week's proposals into actions. All three run on the same
// simulator and the same seeds, receive the same proposals, and return the same shape, so the
// experiment can compare them like for like.
//
//   independent        no arbiter: every agent's proposal is executed as it stands
//   priority_vote      an arbiter with no constraint awareness: proposals are ranked by
//                      department priority x confidence and accepted in that order, skipping direct
//                      contradictions and anything that would overdraw the bank balance by the
//                      agents' own cash-impact claims. It knows nothing of the buffer, the overdraft
//                      limit, the covenant, the 45-day rule or warehouse space.
//   constraint_aware   the Arbiter in arbiter.mjs
//
// Each returns { executed, decisions, conflicts, violations_predicted }, where decisions[] has the
// audit fields the UI and the experiment read (outcome, reason, amounts, blocked_by).
import { PARAMS } from './params.mjs';
import { arbitrate, withIds, detectConflicts, canonicalImpact } from './arbiter.mjs';
import { check } from './constraints.mjs';
import { ACTIONS, CONTRADICTIONS } from './actions.mjs';
import { deptOfAgent } from './roster.mjs';
import { lookahead } from './constraints.mjs';

export const STRATEGIES = ['independent', 'priority_vote', 'constraint_aware'];
export const STRATEGY_LABEL = { independent: 'No arbiter', priority_vote: 'Priority vote', constraint_aware: 'Constraint-aware Arbiter' };

const inr = n => 'Rs ' + Math.round(n).toLocaleString('en-IN');

function record(pr, state, p, base, outcome, reason, approved = pr.amount_inr) {
  const canon = canonicalImpact(pr, state, p, base);
  return {
    id: pr.id, week: state.week, agent: pr.agent, dept: deptOfAgent(pr.agent), action_type: pr.action_type, label: ACTIONS[pr.action_type].label,
    timing_week: pr.timing_week, confidence: pr.confidence, rationale: pr.rationale,
    amount_requested_inr: pr.amount_inr, amount_approved_inr: outcome === 'rejected' ? 0 : approved,
    claimed_cash_impact_inr: pr.cash_impact_inr, canonical_cash_impact_inr: Math.round(canon),
    claim_mismatch: Math.abs(pr.cash_impact_inr - canon) > 0.25 * pr.amount_inr,
    constraints_checked: [], standalone_violations: check([pr], state, p).map(v => v.constraint),
    outcome, blocked_by: [], reason,
  };
}

function independent(rawProposals, state, p) {
  const props = withIds(rawProposals, state.week), base = lookahead([], state, p);
  const decisions = props.map(pr => record(pr, state, p, base, 'approved', 'Executed as proposed: there is no arbiter in this configuration.'));
  return { executed: props, decisions, conflicts: [], violations_predicted: check(props, state, p) };
}

function priorityVote(rawProposals, state, p) {
  const props = withIds(rawProposals, state.week), base = lookahead([], state, p);
  const pri = p.baselines.priority;
  const ranked = [...props].sort((a, b) => pri[deptOfAgent(b.agent)] * b.confidence - pri[deptOfAgent(a.agent)] * a.confidence || a.id.localeCompare(b.id));
  const kept = []; let balance = state.cash; const out = new Map();
  for (const pr of ranked) {
    const score = (pri[deptOfAgent(pr.agent)] * pr.confidence).toFixed(2);
    const rival = kept.find(k => CONTRADICTIONS.some(([x, y]) => (k.action_type === x && pr.action_type === y) || (k.action_type === y && pr.action_type === x)));
    if (rival) { out.set(pr.id, ['rejected', `Rejected: it contradicts "${ACTIONS[rival.action_type].label}" which scored higher (priority x confidence ${score}).`]); continue; }
    if (balance + pr.cash_impact_inr < 0) { out.set(pr.id, ['rejected', `Rejected: by the agents' own figures it would overdraw the bank balance (${inr(balance)} available, ${inr(pr.cash_impact_inr)} impact).`]); continue; }
    kept.push(pr); balance += pr.cash_impact_inr;
    out.set(pr.id, ['approved', `Approved by vote: priority x confidence ${score}; no direct conflict and the balance covers it. Constraints were not checked.`]);
  }
  const decisions = props.map(pr => { const [o, why] = out.get(pr.id); return record(pr, state, p, base, o, why); });
  return { executed: kept, decisions, conflicts: detectConflicts(props, state, p), violations_predicted: check(kept, state, p) };
}

function constraintAware(rawProposals, state, p) {
  const r = arbitrate(rawProposals, state, p);
  return { executed: r.executed, decisions: r.decisions, conflicts: r.conflicts, violations_predicted: r.violations_after, objective: r.objective, search: r.search, feasible: r.feasible };
}

export function decide(strategy, proposals, state, p = PARAMS) {
  if (strategy === 'independent') return independent(proposals, state, p);
  if (strategy === 'priority_vote') return priorityVote(proposals, state, p);
  if (strategy === 'constraint_aware') return constraintAware(proposals, state, p);
  throw new Error('unknown strategy: ' + strategy);
}
