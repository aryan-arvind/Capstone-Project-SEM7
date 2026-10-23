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
import { explainDecisions } from './arbiter.mjs';
import { realizedViolations, check } from './constraints.mjs';
import { arTotal, apTotal } from './books.mjs';
import { DEPARTMENTS, DECISION_DEPTS } from './roster.mjs';
import { runExperiment, writeResults } from './run.mjs';

const blankStats = () => Object.fromEntries(DEPARTMENTS.map(d => [d.key, { proposed: 0, accepted: 0, modified: 0, rejected: 0, violations: 0, cashImpact: 0 }]));

export function createSession({ dataDir, p = PARAMS, llmFactory = null } = {}) {
  const auditFile = dataDir ? path.join(dataDir, 'audit.jsonl') : null;
  let s = null, llm = null;
  const jobs = new Map(); let jobSeq = 0;

  function reset({ seed = 1, scenario = 'baseline', strategy = 'constraint_aware', mode = 'mock', explain = false } = {}) {
    if (!SCENARIOS.includes(scenario)) throw new Error('unknown scenario: ' + scenario);
    if (!STRATEGIES.includes(strategy)) throw new Error('unknown strategy: ' + strategy);
    s = { id: Date.now().toString(36), seed: +seed, scenario, strategy, mode, explain: !!explain, st: initState(+seed, scenario, p), phase: 'idle',
      proposals: [], decision: null, tasks: [], stats: blankStats(), cycles: 0, tokens: 0, calls: 0, lastRealized: [], injected: [], log: [], failures: [] };
    return snapshot();
  }
  const need = () => { if (!s) reset(); return s; };

  const status = d => d.outcome === 'approved' ? 'approved' : d.outcome === 'modified' ? 'modified' : d.blocked_by?.length ? 'blocked' : 'rejected';

  async function getLLM() { if (!llm && llmFactory) llm = await llmFactory(); if (!llm) throw new Error('no model backend available'); return llm; }

  async function propose() {
    need();
    if (s.phase === 'proposed' || s.phase === 'arbitrated') throw new Error('this cycle is already under way: finish it first');
    const r = await proposeAll({ state: s.st, p, mode: s.mode, llm: s.mode === 'llm' ? await getLLM() : null, seed: s.seed });
    s.tokens += r.tokens; s.calls += r.calls; s.failures = r.failures;
    s.proposals = r.proposals;
    s.tasks = r.proposals.map((pr, i) => ({ ...pr, id: `w${s.st.week}-${pr.agent}-${r.proposals.slice(0, i).filter(x => x.agent === pr.agent).length + 1}`, dept: DECISION_DEPTS.find(d => d.agent.id === pr.agent)?.key, state: 'proposed', week: s.st.week }));
    for (const t of s.tasks) s.stats[t.dept].proposed++;
    s.decision = null; s.phase = 'proposed';
    return snapshot();
  }

  async function arbitrate() {
    need();
    if (s.phase !== 'proposed') throw new Error('propose first');
    s.tasks.forEach(t => { t.state = 'arbitrating'; });
    const dec = decide(s.strategy, s.proposals, s.st, p);
    if (s.explain && s.mode === 'llm' && s.strategy === 'constraint_aware') {
      const e = await explainDecisions(dec.decisions, await getLLM());
      s.tokens += e.tokens; s.calls += e.tokens ? 1 : 0;
      for (const d of dec.decisions) d.explanation = e.texts[d.id];
    }
    // decide() numbers proposals by agent in the same order as propose(), so ids line up
    const byId = new Map(dec.decisions.map(d => [d.id, d]));
    for (const t of s.tasks) {
      const d = byId.get(t.id); if (!d) continue;
      t.state = status(d); t.decision = d; t.amount_approved_inr = d.amount_approved_inr; t.reason = d.explanation || d.reason; t.outcome = d.outcome; t.blocked_by = d.blocked_by;
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
    const rec = step(s.st, { p });
    s.lastRealized = realizedViolations(s.st, p);
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
    const evs = makeEvents(type, p).map(e => ({ ...e, week: s.st.week, ...(e.until ? { until: s.st.week + (e.until - p.scenarios.event_week) } : {}) }));
    s.st.events.push(...evs); s.injected.push({ week: s.st.week, type });
    return snapshot();
  }

  function appendAudit(dec, week) {
    if (!auditFile) return;
    try {
      fs.mkdirSync(path.dirname(auditFile), { recursive: true });
      const meta = { ts: new Date().toISOString(), session: s.id, seed: s.seed, scenario: s.scenario, strategy: s.strategy, mode: s.mode, week };
      const lines = dec.decisions.map(d => JSON.stringify({ ...meta, ...d, set_violations_before: dec.violations_before?.map(v => v.constraint) || [], set_violations_after: (dec.violations_predicted || dec.violations_after || []).map(v => v.constraint) }));
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
    const m = metrics(s.st, p), st = s.st;
    return {
      session: s.id, week: st.week, seed: s.seed, scenario: s.scenario, strategy: s.strategy, strategyLabel: STRATEGY_LABEL[s.strategy], mode: s.mode, explain: s.explain, phase: s.phase, cycles: s.cycles,
      metrics: { cash: m.cash, runway: m.runway, dso: m.dso, dpo: m.dpo, ccc: m.ccc, dio: m.dio },
      books: { ar: arTotal(st), ap: apTotal(st), inventory_units: st.inv.units, od_used: st.od.used, od_limit: st.od.limit, gst_payable: st.gstPayable },
      constraints: p.constraints, realized_violations: s.lastRealized, injected: s.injected,
      depts: s.stats, tasks: s.tasks.map(t => ({ id: t.id, dept: t.dept, agent: t.agent, action_type: t.action_type, label: t.decision?.label, amount_inr: t.amount_inr, amount_approved_inr: t.amount_approved_inr ?? null,
        timing_week: t.timing_week, cash_impact_inr: t.cash_impact_inr, confidence: t.confidence, rationale: t.rationale, state: t.state, outcome: t.outcome || null, blocked_by: t.blocked_by || [], reason: t.reason || null })),
      conflicts: s.decision?.conflicts || [], predicted_violations: (s.decision?.violations_predicted || []).map(v => v.constraint),
      tokens: s.tokens, llm_calls: s.calls, schema_failures: s.failures,
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
        const mode = opts.mode === 'llm' ? 'llm' : 'mock';
        const llmI = mode === 'llm' ? await getLLM() : null;
        const result = await runExperiment({ seeds: Math.min(+opts.seeds || 10, 200), scenarios: opts.scenarios?.length ? opts.scenarios : SCENARIOS, strategies: opts.strategies?.length ? opts.strategies : STRATEGIES, weeks: opts.weeks ? +opts.weeks : undefined, mode, llm: llmI, explain: !!opts.explain,
          onProgress: (d, t) => { job.done = d; job.total = t; } });
        if (dataDir) writeResults(result, path.join(path.dirname(dataDir), 'results'));
        job.summary = { meta: { ...result.meta, params: undefined }, summary: result.summary, comparisons: result.comparisons };
        job.state = 'done';
      } catch (e) { job.state = 'error'; job.error = e.message; }
    })();
    return { id };
  }
  const job = id => { const j = jobs.get(id); return j ? { ...j } : null; };
  const latestResults = () => {
    if (!dataDir) return null;
    const f = path.join(path.dirname(dataDir), 'results', 'results.json');
    if (!fs.existsSync(f)) return null;
    const r = JSON.parse(fs.readFileSync(f, 'utf8'));
    return { meta: { ...r.meta, params: undefined }, summary: r.summary, comparisons: r.comparisons };
  };

  return { reset, propose, arbitrate, execute, cycle, inject, snapshot, readAudit, startExperiment, job, latestResults, check: () => check([], need().st, p) };
}
