// One episode: a seeded company, one scenario, one strategy, `episode_weeks` decision cycles.
// Used by the CLI runner, the server (the UI's "run a decision cycle" / experiment button) and the tests.
import { PARAMS } from './params.mjs';
import { initState, step, schedule, metrics } from './sim.mjs';
import { proposeAll } from './agents.mjs';
import { decide } from './strategies.mjs';
import { realizedViolations, CONSTRAINTS } from './constraints.mjs';
import { apTotal, arTotal, sum } from './books.mjs';

const netWorth = (st, p) => st.cash + arTotal(st) + st.inv.units * p.sim.unit_cost - apTotal(st) - st.od.used - st.gstPayable;

/** Run one decision cycle on a live state: propose, decide, execute (schedule), advance a week. */
export function runCycle({ st, strategy, p = PARAMS, seed = st.seed }) {
  const pr = proposeAll({ state: st, p, seed });
  const decision = decide(strategy, pr.proposals, st, p);
  for (const e of decision.executed) schedule(st, e);
  const week = st.week;
  const rec = step(st, { p });
  const realized = realizedViolations(st, p);
  return { week, proposals: pr.proposals, decision, record: rec, realized, failures: pr.failures };
}

export function runEpisode({ seed, scenario = 'baseline', strategy = 'constraint_aware', p = PARAMS, keepAudit = false }) {
  const st = initState(seed, scenario, p);
  const weekly = [], audit = [];
  const tot = { proposals: 0, approved: 0, modified: 0, rejected: 0, predictedViolationCycles: 0, caught: 0 };
  const byConstraint = Object.fromEntries(CONSTRAINTS.map(c => [c, 0]));
  let violationWeeks = 0, violationCount = 0, minCash = Infinity; const ccc = [];
  for (let w = 0; w < p.sim.episode_weeks; w++) {
    const c = runCycle({ st, strategy, p, seed });
    const m = metrics(st, p);
    ccc.push(m.ccc);
    minCash = Math.min(minCash, st.cash);
    if (c.realized.length) violationWeeks++;
    violationCount += c.realized.length;
    for (const v of c.realized) byConstraint[v.constraint]++;
    tot.proposals += c.decision.decisions.length;
    for (const d of c.decision.decisions) { tot[d.outcome]++; if (d.outcome !== 'approved' && d.blocked_by.length) tot.caught++; }
    if (c.decision.violations_predicted.length) tot.predictedViolationCycles++;
    weekly.push({ week: w, cash: st.cash, ar: arTotal(st), ap: apTotal(st), inv_units: st.inv.units, od_used: st.od.used, od_limit: st.od.limit, stockout_units: c.record.stockout,
      violations: c.realized.map(v => v.constraint), executed: c.decision.executed.length, proposed: c.decision.decisions.length, ...m });
    if (keepAudit) audit.push(...c.decision.decisions);
  }
  const m = metrics(st, p), n = p.sim.episode_weeks;
  const row = {
    seed, scenario, strategy, weeks: n,
    violation_rate: violationWeeks / n, violation_weeks: violationWeeks, violations: violationCount,
    ...Object.fromEntries(CONSTRAINTS.map(c => ['v_' + c.toLowerCase(), byConstraint[c]])),
    predicted_violation_rate: tot.predictedViolationCycles / n,
    min_cash_inr: minCash, ending_cash_inr: st.cash, ending_net_worth_inr: Math.round(netWorth(st, p)),
    profit_inr: Math.round(st.stats.profit), stockout_units: st.stats.stockoutUnits, stockout_weeks: st.stats.stockoutWeeks,
    ccc_days: +(sum(ccc) / ccc.length).toFixed(2), dso_days: +m.dso.toFixed(2), dpo_days: +m.dpo.toFixed(2),
    interest_inr: st.stats.interest, penalties_inr: st.stats.penalties,
    proposals: tot.proposals, approved: tot.approved, modified: tot.modified, rejected: tot.rejected, caught: tot.caught,
  };
  return { row, weekly, audit, state: st };
}
