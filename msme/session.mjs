// A live company for the UI: one seeded simulation the owner steps through a decision cycle at a time.
// A cycle has three phases, and the UI's task statuses are these phases, not theatre:
//   propose    each department agent proposes                      -> status "proposed"
//   arbitrate  the strategy decides (the Arbiter checks constraints) -> "approved" / "modified" / "rejected" / "blocked"
//   execute    approved actions are scheduled and the week advances -> "executed"
// Every decision is appended to the audit log (data/audit.jsonl).
import fs from 'node:fs';
import path from 'node:path';
import { PARAMS } from './params.mjs';
import { initState, step, schedule, metrics, makeEvents, SCENARIOS } from './sim.mjs';
import { proposeAll } from './agents.mjs';
import { decide, STRATEGIES, STRATEGY_LABEL } from './strategies.mjs';
import { realizedViolations, check } from './constraints.mjs';
import { arTotal, apTotal } from './books.mjs';
import { DEPARTMENTS, DECISION_DEPTS } from './roster.mjs';
import { runExperiment, writeResults } from './run.mjs';
import { initStateFromLedger } from './live.mjs';
import { proposeAllWithLLM, arbitrateWithLLM } from './llm_agents.mjs';

const blankStats = () => Object.fromEntries(DEPARTMENTS.map(d => [d.key, { proposed: 0, accepted: 0, modified: 0, rejected: 0, violations: 0, cashImpact: 0 }]));

export function createSession({ dataDir, p = PARAMS, live: defaultLive = false } = {}) {
  const auditFile = dataDir ? path.join(dataDir, 'audit.jsonl') : null;
  const ledgerFile = dataDir ? path.join(dataDir, 'ledger.json') : null;
  const baseP = p;
  let activeP = p;
  let s = null;
  const jobs = new Map(); let jobSeq = 0;

  function reset({ seed = 1, scenario = 'baseline', strategy = 'constraint_aware', live } = {}) {
    if (!SCENARIOS.includes(scenario)) throw new Error('unknown scenario: ' + scenario);
    if (!STRATEGIES.includes(strategy)) throw new Error('unknown strategy: ' + strategy);

    const isLive = live !== undefined ? Boolean(live) : (process.env.MSME_LIVE === '1' || defaultLive);
    let state = null;
    let dataSource = 'synthetic';

    if (isLive && ledgerFile && fs.existsSync(ledgerFile)) {
      try {
        const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
        activeP = {
          ...baseP,
          sim: {
            ...baseP.sim,
            ...(ledger.sim_overrides || {}),
          },
        };
        state = initStateFromLedger(ledger, +seed, scenario, activeP);
        dataSource = ledger.data_source || 'ledger.json';
      } catch (err) {
        throw new Error(`Failed to initialize live state from ${ledgerFile}: ${err.message}`);
      }
    } else {
      activeP = baseP;
      state = initState(+seed, scenario, baseP);
      dataSource = 'synthetic';
    }

    s = { id: Date.now().toString(36), seed: +seed, scenario, strategy, st: state, phase: 'idle',
      proposals: [], decision: null, tasks: [], stats: blankStats(), cycles: 0, lastRealized: [], injected: [], log: [], failures: [],
      isLive: (dataSource !== 'synthetic'), dataSource };
    return snapshot();
  }
  const need = () => { if (!s) reset(); return s; };

  const status = d => d.outcome === 'approved' ? 'approved' : d.outcome === 'modified' ? 'modified' : d.blocked_by?.length ? 'blocked' : 'rejected';

  async function propose(opts = {}) {
    need();
    if (s.phase === 'proposed' || s.phase === 'arbitrated') throw new Error('this cycle is already under way: finish it first');
    const r = await proposeAllWithLLM({
      state: s.st,
      p: activeP,
      seed: s.seed,
      lastDecisions: s.decision?.decisions || [],
      scenarioText: s.scenario,
      mockHandler: opts.mockLLMHandler || null,
    });
    s.failures = r.failures;
    s.proposals = r.proposals;
    s.tasks = r.proposals.map((pr, i) => ({
      ...pr,
      id: `w${s.st.week}-${pr.agent}-${r.proposals.slice(0, i).filter(x => x.agent === pr.agent).length + 1}`,
      dept: DECISION_DEPTS.find(d => d.agent.id === pr.agent)?.key,
      state: 'proposed',
      week: s.st.week,
      source: pr.source || 'rule-fallback',
    }));
    for (const t of s.tasks) s.stats[t.dept].proposed++;
    s.decision = null; s.phase = 'proposed';
    return snapshot();
  }

  async function arbitrate(opts = {}) {
    need();
    if (s.phase !== 'proposed') throw new Error('propose first');
    s.tasks.forEach(t => { t.state = 'arbitrating'; });
    let dec = null;
    if (s.strategy === 'constraint_aware') {
      dec = await arbitrateWithLLM(s.proposals, s.st, activeP, { mockHandler: opts.mockLLMHandler || null });
    }
    if (!dec) {
      dec = decide(s.strategy, s.proposals, s.st, activeP);
    }
    const byId = new Map(dec.decisions.map(d => [d.id, d]));
    for (const t of s.tasks) {
      const d = byId.get(t.id); if (!d) continue;
      t.state = status(d); t.decision = d; t.amount_approved_inr = d.amount_approved_inr; t.reason = d.reason; t.outcome = d.outcome; t.blocked_by = d.blocked_by;
      t.source = d.source || t.source || 'rule-fallback';
    }
    s.decision = dec; s.phase = 'arbitrated';
    return snapshot();
  }

  async function execute() {
    need();
    if (s.phase !== 'arbitrated') throw new Error('arbitrate first');
    const dec = s.decision, week = s.st.week;
    const arb = s.stats.arbiter;
    for (const t of s.tasks) {
      const d = t.decision; if (!d) continue;
      const row = s.stats[t.dept];
      if (d.outcome === 'approved') row.accepted++; else if (d.outcome === 'modified') row.modified++; else row.rejected++;
      if (d.outcome !== 'approved' && d.blocked_by?.length) { row.violations++; arb.violations++; }
      if (d.outcome !== 'rejected') row.cashImpact += Math.round(d.canonical_cash_impact_inr * (d.amount_approved_inr / d.amount_requested_inr));
      arb.proposed++; if (d.outcome === 'modified') arb.modified++;
      if (d.outcome !== 'rejected') t.state = 'executed';
    }
    for (const e of dec.executed) schedule(s.st, e);
    const rec = step(s.st, { p: activeP });
    s.lastRealized = realizedViolations(s.st, activeP);
    s.cycles++;
    appendAudit(dec, week);
    s.log.push({ week, proposed: s.tasks.length, executed: dec.executed.length, realized: s.lastRealized.map(v => v.constraint), record: { revenue: rec.revenue, stockout: rec.stockout, cash: s.st.cash } });
    s.phase = 'idle';
    return snapshot();
  }

  async function cycle() { await propose(); await arbitrate(); return execute(); }

  function inject(type) {
    need();
    if (!SCENARIOS.includes(type) || type === 'baseline') throw new Error('unknown scenario: ' + type);
    const evs = makeEvents(type, activeP).map(e => ({ ...e, week: s.st.week, ...(e.until ? { until: s.st.week + (e.until - activeP.scenarios.event_week) } : {}) }));
    s.st.events.push(...evs); s.injected.push({ week: s.st.week, type });
    return snapshot();
  }

  function appendAudit(dec, week) {
    if (!auditFile) return;
    try {
      fs.mkdirSync(path.dirname(auditFile), { recursive: true });
      const meta = { ts: new Date().toISOString(), session: s.id, seed: s.seed, scenario: s.scenario, strategy: s.strategy, week };
      const lines = dec.decisions.map(d => JSON.stringify({ ...meta, ...d, source: d.source || dec.source || 'rule-fallback', set_violations_before: dec.violations_before?.map(v => v.constraint) || [], set_violations_after: (dec.violations_predicted || dec.violations_after || []).map(v => v.constraint) }));
      fs.appendFileSync(auditFile, lines.join('\n') + '\n');
    } catch { /* the audit file is best-effort on disk; the in-memory log below still holds it */ }
  }

  function readAudit(limit = 200) {
    if (!auditFile || !fs.existsSync(auditFile)) return [];
    const lines = fs.readFileSync(auditFile, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-limit).reverse().map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  }

  function snapshot() {
    need();
    const m = metrics(s.st, activeP), st = s.st;
    return {
      session: s.id, week: st.week, seed: s.seed, scenario: s.scenario, strategy: s.strategy, strategyLabel: STRATEGY_LABEL[s.strategy], phase: s.phase, cycles: s.cycles,
      mode: s.isLive ? 'live' : 'synthetic',
      data_source: s.dataSource,
      metrics: { cash: m.cash, runway: m.runway, dso: m.dso, dpo: m.dpo, ccc: m.ccc, dio: m.dio },
      books: { ar: arTotal(st), ap: apTotal(st), inventory_units: st.inv.units, od_used: st.od.used, od_limit: st.od.limit, gst_payable: st.gstPayable },
      constraints: activeP.constraints, realized_violations: s.lastRealized, injected: s.injected,
      depts: s.stats, tasks: s.tasks.map(t => ({ id: t.id, dept: t.dept, agent: t.agent, action_type: t.action_type, label: t.decision?.label, amount_inr: t.amount_inr, amount_approved_inr: t.amount_approved_inr ?? null,
        timing_week: t.timing_week, cash_impact_inr: t.cash_impact_inr, confidence: t.confidence, rationale: t.rationale, state: t.state, outcome: t.outcome || null, blocked_by: t.blocked_by || [], reason: t.reason || null, source: t.source || 'rule-fallback' })),
      conflicts: s.decision?.conflicts || [], predicted_violations: (s.decision?.violations_predicted || []).map(v => v.constraint),
      schema_failures: s.failures,
      log: s.log.slice(-20),
    };
  }

  /* ---------- experiments run as background jobs, so the page can poll ---------- */
  function startExperiment(opts) {
    const id = 'x' + (++jobSeq);
    const job = { id, state: 'running', done: 0, total: 0, startedAt: Date.now(), opts, error: null, summary: null };
    jobs.set(id, job);
    (async () => {
      try {
        const result = await runExperiment({ seeds: Math.min(+opts.seeds || 10, 200), scenarios: opts.scenarios?.length ? opts.scenarios : SCENARIOS, strategies: opts.strategies?.length ? opts.strategies : STRATEGIES, weeks: opts.weeks ? +opts.weeks : undefined, p: baseP,
          onProgress: (d, t) => { job.done = d; job.total = t; } });
        if (dataDir) writeResults(result, path.join(path.dirname(dataDir), 'results'));
        job.summary = { meta: { ...result.meta, params: undefined }, summary: result.summary, comparisons: result.comparisons };
        job.state = 'done';
      } catch (e) { job.state = 'error'; job.error = e.message; }
    })();
    return { id };
  }
  const job = id => { const j = jobs.get(id); return j ? { ...j } : null; };

  function latestResults() {
    try {
      const f = path.join(path.dirname(dataDir || 'data'), 'results', 'results.json');
      return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
    } catch { return null; }
  }

  return { reset, propose, arbitrate, execute, cycle, inject, snapshot, readAudit, startExperiment, job, latestResults };
}
