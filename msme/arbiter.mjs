// The Arbiter. Plain deterministic code: no model decides anything in this file.
//
// Given every proposal for the week and the current books it
//   1. detects conflicts (contradictory actions, contention for the same cash, contention for warehouse space),
//   2. searches for the best FEASIBLE subset, possibly with reduced amounts, and
//   3. writes an audit record for every proposal: outcome, constraints checked, reason.
//
// Objective (maximised, config/params.json "objective"):
//   J(S) = w_profit * sum(confidence_i * profit_i)  +  w_risk * sum(confidence_i * risk_reduction_i)
//          + w_liquidity * min(min_headroom(S), liquidity_target)
// profit_i / risk_i come from the same effect models the simulator uses (actions.mjs `value`), at the
// proposal's (possibly reduced) amount; min_headroom(S) is the lowest projected cash above the buffer over
// the look-ahead horizon with S applied.
//
// Search: exact enumeration of all subsets at full amounts when there are at most `max_exact_proposals`
// proposals (every subset is looked ahead and checked), otherwise a greedy build. Either way the result is
// then refined by coordinate ascent over amount levels {0, 25%, 50%, 75%, 100%} of each proposal. A set is
// feasible when the look-ahead shows no constraint violation; feasible beats infeasible, higher J beats
// lower J. If no feasible set exists (a shock has already broken a constraint) the Arbiter picks the set
// with the smallest total violation, then the highest J. Ties are broken deterministically.
import { PARAMS } from './params.mjs';
import { ACTIONS, CONTRADICTIONS } from './actions.mjs';
import { lookahead, evaluateSnapshot, totalMagnitude, check } from './constraints.mjs';
import { deptOfAgent } from './roster.mjs';

const k1000 = x => Math.max(1000, Math.round(x / 1000) * 1000);
const inr = n => 'Rs ' + Math.round(n).toLocaleString('en-IN');
const label = pr => ACTIONS[pr.action_type].label;

export function withIds(proposals, week) {
  const seen = {};
  return proposals.map(pr => { const n = seen[pr.agent] = (seen[pr.agent] || 0) + 1; return { ...pr, id: pr.id || `w${week}-${pr.agent}-${n}` }; });
}

/** Cash effect of one proposal on its own, within the horizon: the books' answer, not the agent's claim. */
export function canonicalImpact(pr, state, p, base = lookahead([], state, p)) {
  const w = lookahead([pr], state, p);
  return w[w.length - 1].cash - base[base.length - 1].cash;
}

/* ------------------------------------------------------------------ conflicts */
export function detectConflicts(props, state, p = PARAMS) {
  const out = [];
  const base = lookahead([], state, p);
  for (const [a, b] of CONTRADICTIONS) {
    const A = props.filter(x => x.action_type === a), B = props.filter(x => x.action_type === b);
    if (A.length && B.length) out.push({ type: 'contradiction', ids: [...A, ...B].map(x => x.id), detail: `${label(A[0])} contradicts ${label(B[0])}` });
  }
  const impacts = props.map(pr => ({ pr, impact: canonicalImpact(pr, state, p, base) }));
  const outflows = impacts.filter(x => x.impact < 0);
  const headroom = Math.min(...base.map(s => s.cash)) - p.constraints.min_cash_buffer;
  const asked = -outflows.reduce((s, x) => s + x.impact, 0);
  if (outflows.length > 1 && asked > Math.max(0, headroom)) out.push({ type: 'cash_contention', ids: outflows.map(x => x.pr.id), detail: `${outflows.length} proposals ask for ${inr(asked)} of cash against ${inr(Math.max(0, headroom))} of headroom above the buffer` });
  const room = p.constraints.inventory_capacity_units - base[0].committedUnits;
  const adds = props.map(pr => ({ pr, units: lookahead([pr], state, p)[0].committedUnits - base[0].committedUnits })).filter(x => x.units > 0);
  const unitsAsked = adds.reduce((s, x) => s + x.units, 0);
  if (adds.length > 1 && unitsAsked > room) out.push({ type: 'stock_capacity', ids: adds.map(x => x.pr.id), detail: `${adds.length} proposals add ${unitsAsked} units against ${Math.max(0, room)} units of warehouse room` });
  return out;
}

/* ------------------------------------------------------------------ arbitration */
export function arbitrate(rawProposals, state, p = PARAMS) {
  const week = state.week, O = p.objective, buffer = p.constraints.min_cash_buffer;
  const props = withIds(rawProposals, week).sort((a, b) => a.id.localeCompare(b.id));
  const n = props.length;
  const levels = [0, ...[...O.amount_fractions].sort((a, b) => a - b)];
  const conflicts = detectConflicts(props, state, p);
  const violationsBefore = check([], state, p);
  const standalone = props.map(pr => check([pr], state, p));
  const claimed = props.map(pr => pr.cash_impact_inr);
  const base = lookahead([], state, p);
  const canon = props.map(pr => canonicalImpact(pr, state, p, base));
  const econ = props.map(pr => ACTIONS[pr.action_type].value(pr.amount_inr, state, p));

  const scaled = (i, f) => f === 1 ? props[i] : { ...props[i], amount_inr: k1000(props[i].amount_inr * f) };
  const cache = new Map(); let evaluated = 0;
  const contradicts = (i, j) => CONTRADICTIONS.some(([a, b]) => (props[i].action_type === a && props[j].action_type === b) || (props[i].action_type === b && props[j].action_type === a));

  function evaluate(cfg) {
    const key = cfg.join(','); if (cache.has(key)) return cache.get(key);
    evaluated++;
    const on = cfg.map((f, i) => f > 0 ? i : -1).filter(i => i >= 0);
    let r;
    if (on.some((i, a) => on.slice(a + 1).some(j => contradicts(i, j)))) r = { valid: false, cfg };
    else {
      const set = on.map(i => scaled(i, cfg[i]));
      const snaps = lookahead(set, state, p);
      const violations = snaps.flatMap(s => evaluateSnapshot(s, p));
      let profit = 0, risk = 0;
      for (const i of on) { const v = ACTIONS[props[i].action_type].value(set[on.indexOf(i)].amount_inr, state, p); profit += props[i].confidence * v.profit; risk += props[i].confidence * v.risk; }
      const headroom = Math.min(...snaps.map(s => s.cash - buffer));
      const liquidity = Math.min(Math.max(headroom, 0), O.liquidity_target);
      r = { valid: true, cfg, violations, magnitude: totalMagnitude(violations), feasible: violations.length === 0, profit, risk, liquidity, headroom,
        J: O.w_profit * profit + O.w_risk * risk + O.w_liquidity * liquidity, count: on.length };
    }
    cache.set(key, r); return r;
  }
  const better = (a, b) => { // is a better than b?
    if (!b || !b.valid) return a.valid;
    if (!a.valid) return false;
    if (a.feasible !== b.feasible) return a.feasible;
    if (!a.feasible && a.magnitude !== b.magnitude) return a.magnitude < b.magnitude;
    if (a.J !== b.J) return a.J > b.J;
    if (a.count !== b.count) return a.count < b.count;
    return a.cfg.join(',') < b.cfg.join(',');
  };

  let best = evaluate(new Array(n).fill(0)), method;
  if (n <= O.max_exact_proposals) {
    method = 'exact subsets + amount refinement';
    for (let mask = 1; mask < (1 << n); mask++) {
      const cfg = new Array(n); for (let i = 0; i < n; i++) cfg[i] = (mask >> i) & 1;
      const r = evaluate(cfg); if (better(r, best)) best = r;
    }
  } else {
    method = 'greedy build + amount refinement';
    for (let improved = true; improved;) {
      improved = false; let cand = null;
      for (let i = 0; i < n; i++) if (best.cfg[i] === 0) { const cfg = [...best.cfg]; cfg[i] = 1; const r = evaluate(cfg); if (better(r, best) && better(r, cand)) cand = r; }
      if (cand) { best = cand; improved = true; }
    }
  }
  for (let pass = 0; pass < 4; pass++) { // coordinate ascent over amount levels
    let improved = false;
    for (let i = 0; i < n; i++) for (const f of levels) {
      if (f === best.cfg[i]) continue;
      const cfg = [...best.cfg]; cfg[i] = f; const r = evaluate(cfg); if (better(r, best)) { best = r; improved = true; }
    }
    if (!improved) break;
  }

  /* ---- audit records */
  const kept = best.cfg.map((f, i) => f > 0 ? i : -1).filter(i => i >= 0);
  const executed = kept.map(i => ({ ...scaled(i, best.cfg[i]), requested_amount_inr: props[i].amount_inr }));
  const decisions = props.map((pr, i) => {
    const f = best.cfg[i], outcome = f === 0 ? 'rejected' : f === 1 ? 'approved' : 'modified';
    const withFull = (() => { const cfg = [...best.cfg]; cfg[i] = 1; return evaluate(cfg); })();
    let reason, blockedBy = [];
    if (outcome === 'approved') reason = `Approved in full: with the other approved proposals it breaks no constraint (lowest projected cash ${inr(best.headroom + buffer)} against the ${inr(buffer)} buffer).`;
    else {
      const newViol = withFull.valid ? withFull.violations.filter(v => !best.violations.some(b => b.constraint === v.constraint && b.week === v.week)) : [];
      const rival = kept.find(j => j !== i && contradicts(i, j));
      blockedBy = [...new Set(newViol.map(v => v.constraint))];
      const why = newViol.length ? `${newViol[0].constraint.replace(/_/g, ' ').toLowerCase()}: ${newViol[0].detail}` : null;
      if (outcome === 'modified') reason = `Reduced from ${inr(pr.amount_inr)} to ${inr(executed.find(e => e.id === pr.id).amount_inr)} (${Math.round(f * 100)}%)${why ? ` because the full amount would break ${why}` : ' because a smaller amount scores better for the company'}.`;
      else if (!withFull.valid && rival !== undefined) reason = `Rejected: it contradicts "${label(props[rival])}" from ${props[rival].agent}, which was kept because it is worth more under the same constraints.`;
      else if (why) reason = `Rejected: with the approved set it would break ${why}.`;
      else reason = `Rejected: it is feasible but lowers the objective by ${inr(best.J - withFull.J)} compared with the chosen set.`;
    }
    const sv = standalone[i];
    const checked = ['MIN_CASH_BUFFER', 'OD_LIMIT', 'COVENANT_RATIO', 'PAYMENT_TERM', 'INVENTORY_CAPACITY'].map(c => {
      const v = sv.find(x => x.constraint === c); return { constraint: c, passed: !v, ...(v ? { detail: v.detail } : {}) };
    });
    return {
      id: pr.id, week, agent: pr.agent, dept: deptOfAgent(pr.agent), action_type: pr.action_type, label: label(pr),
      timing_week: pr.timing_week, confidence: pr.confidence, rationale: pr.rationale,
      amount_requested_inr: pr.amount_inr, amount_approved_inr: f === 0 ? 0 : (executed.find(e => e.id === pr.id).amount_inr),
      claimed_cash_impact_inr: claimed[i], canonical_cash_impact_inr: Math.round(canon[i]),
      claim_mismatch: Math.abs(claimed[i] - canon[i]) > 0.25 * pr.amount_inr,
      expected_profit_inr: Math.round(econ[i].profit), expected_risk_reduction_inr: Math.round(econ[i].risk),
      constraints_checked: checked, standalone_violations: sv.map(v => v.constraint),
      outcome, blocked_by: blockedBy, reason,
    };
  });
  return {
    week, decisions, executed, conflicts,
    objective: { J: Math.round(best.J), profit: Math.round(best.profit), risk: Math.round(best.risk), liquidity: Math.round(best.liquidity), min_projected_cash: Math.round(best.headroom + buffer) },
    violations_before: violationsBefore, violations_after: best.violations || [], feasible: !!best.feasible,
    search: { method, proposals: n, evaluated },
  };
}

/* ------------------------------------------------------------------ the only place a model is used: words */
/**
 * Ask a model to explain each decision in plain language. The outcome and the numbers are fixed facts
 * handed to it; it cannot change them. When llm is null, the model fails, or its reply is unusable, the
 * deterministic reason stays. Returns { texts: {id: sentence}, tokens }.
 */
export async function explainDecisions(decisions, llm) {
  const texts = Object.fromEntries(decisions.map(d => [d.id, d.reason]));
  if (!llm || !decisions.length) return { texts, tokens: 0 };
  const facts = decisions.map(d => ({ id: d.id, agent: d.agent, action: d.label, requested_inr: d.amount_requested_inr, approved_inr: d.amount_approved_inr, outcome: d.outcome, reason: d.reason }));
  const system = 'You write short explanations for a small-business owner in India. For each decision, write one plain sentence (under 35 words) saying what happened and why, using only the facts given. Do not change any outcome or number. Reply with JSON only: {"<id>": "<sentence>", ...}';
  try {
    const r = await llm.ask(system, JSON.stringify(facts, null, 1));
    const s = String(r.text).replace(/```(?:json)?/gi, ''); const j = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    for (const d of decisions) if (typeof j[d.id] === 'string' && j[d.id].trim()) texts[d.id] = j[d.id].trim().slice(0, 400);
    const u = r.usage || {};
    return { texts, tokens: (u.input_tokens || 0) + (u.output_tokens || 0) };
  } catch { return { texts, tokens: 0 }; }
}
