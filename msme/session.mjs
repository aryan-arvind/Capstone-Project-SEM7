import { validateLedger } from './live.mjs';
import { callLLM, getLLMStatus } from './llm.mjs';
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

  function inject(arg) {
    need();
    let type = typeof arg === 'string' ? arg : (arg?.type || 'custom');
    let rawText = typeof arg === 'string' ? arg : (arg?.text || arg?.type || '');
    if (type === 'baseline') throw new Error('cannot inject baseline');
    if (SCENARIOS.includes(type)) {
      const evs = makeEvents(type, activeP).map(e => ({ ...e, week: s.st.week, ...(e.until ? { until: s.st.week + (e.until - activeP.scenarios.event_week) } : {}) }));
      s.st.events.push(...evs);
      s.injected.push({ week: s.st.week, type, text: rawText });
      s.activeScenarioText = rawText;
    } else {
      // Free-text arbitrary scenario injection
      s.activeScenarioText = rawText || type;
      s.injected.push({ week: s.st.week, type: 'custom', text: s.activeScenarioText });
    }
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

    function overrideDecision({ id, outcome, amount }) {
    need();
    const t = s.tasks.find(x => x.id === id);
    if (!t) throw new Error('Task not found: ' + id);
    const validOutcome = ['approved', 'rejected', 'modified'].includes(outcome) ? outcome : 'approved';
    t.state = validOutcome;
    if (t.decision) {
      t.decision.outcome = validOutcome;
      if (validOutcome === 'approved') t.decision.amount_approved_inr = t.amount_inr;
      else if (validOutcome === 'rejected') t.decision.amount_approved_inr = 0;
      else if (validOutcome === 'modified' && amount) t.decision.amount_approved_inr = Math.round(Number(amount));
      t.decision.reason = `Human decision override: marked as ${validOutcome}`;
      t.amount_approved_inr = t.decision.amount_approved_inr;
      t.reason = t.decision.reason;
    }
    return snapshot();
  }

  
  async function chat({ question }) {
    need();
    const snap = snapshot();
    const isLLMOn = process.env.LLM_MODE === 'on';
    if (!isLLMOn) {
      return {
        answer: "LLM is currently OFF (mode: rule fallback). Current company status: Cash is ₹" + Math.round(snap.metrics.cash).toLocaleString('en-IN') + ", runway is " + (snap.metrics.runway || 0).toFixed(1) + " weeks, AR total is ₹" + Math.round(snap.books.ar).toLocaleString('en-IN') + ". Enable LLM_MODE=on in .env with a Groq or Gemini API key for active neural finance advisory.",
        source: "rule-fallback",
        suggested_action: null
      };
    }
    const systemPrompt = `You are the executive finance advisory team for ${snap.session} (${snap.mode === 'live' ? 'Real Books' : 'Synthetic Company'}).
Financial Snapshot:
- Cash on Hand: ₹${Math.round(snap.metrics.cash)}
- Overdraft: ₹${Math.round(snap.books.od_used)} used of ₹${Math.round(snap.books.od_limit)} limit
- Receivables (AR): ₹${Math.round(snap.books.ar)}
- Payables (AP): ₹${Math.round(snap.books.ap)}
- Inventory Units: ${snap.books.inventory_units}
- GST Payable: ₹${Math.round(snap.books.gst_payable)}
- Recent Decisions: ${JSON.stringify(snap.tasks.map(t => ({ dept: t.dept, action: t.action_type, amt: t.amount_approved_inr, status: t.state, reason: t.reason })))}

Answer the client's question concisely, strategically, and honestly. If appropriate, suggest a concrete scenario or client action.
Return STRICT JSON ONLY:
{
  "answer": "Detailed helpful answer",
  "suggested_action": {
    "type": "inject_scenario", // or "record_event"
    "text": "Scenario description to inject",
    "label": "Button label for user confirmation"
  } // or null if no action needed
}`;
    const userPrompt = `Client question: "${question}"`;
    const res = await callLLM({ systemPrompt, userPrompt, schemaName: 'FinanceChat' });
    if (!res) {
      return {
        answer: "Could not reach LLM provider. Current Cash: ₹" + Math.round(snap.metrics.cash).toLocaleString('en-IN') + ", Runway: " + (snap.metrics.runway || 0).toFixed(1) + " weeks.",
        source: "rule-fallback",
        suggested_action: null
      };
    }
    try {
      const parsed = JSON.parse(res.text);
      return {
        answer: parsed.answer || res.text,
        suggested_action: parsed.suggested_action || null,
        source: res.model
      };
    } catch {
      return {
        answer: res.text,
        suggested_action: null,
        source: res.model
      };
    }
  }

  function executeClientAction({ action, params }) {
    need();
    if (!ledgerFile) throw new Error('No ledger file available');
    const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
    const auditRecord = {
      ts: new Date().toISOString(),
      action: `client:${action}`,
      user: 'client_dashboard',
      params
    };

    if (action === 'mark_receivable_paid') {
      const idx = ledger.ar.findIndex(item => item.id === params.id || (item.customer === params.customer && item.amount === params.amount));
      if (idx === -1) throw new Error('Receivable not found');
      const paid = ledger.ar.splice(idx, 1)[0];
      ledger.cash = Math.round(ledger.cash + paid.amount);
      auditRecord.details = `Received payment of ₹${paid.amount} from ${paid.customer || paid.id}`;
    } else if (action === 'pay_payable') {
      const idx = ledger.ap.findIndex(item => item.id === params.id || (item.supplier === params.supplier && item.amount === params.amount));
      if (idx === -1) throw new Error('Payable bill not found');
      const bill = ledger.ap.splice(idx, 1)[0];
      const available = ledger.cash + (ledger.od_limit - ledger.od_used);
      if (available < bill.amount) {
        throw new Error(`Insufficient funds: cash+OD available is ₹${available}, bill is ₹${bill.amount}`);
      }
      if (ledger.cash >= bill.amount) {
        ledger.cash -= bill.amount;
      } else {
        const rem = bill.amount - ledger.cash;
        ledger.cash = 0;
        ledger.od_used += rem;
      }
      auditRecord.details = `Paid supplier bill of ₹${bill.amount} to ${bill.supplier || bill.id}`;
    } else if (action === 'add_receivable') {
      const amt = Math.round(Number(params.amount));
      if (amt <= 0) throw new Error('Amount must be positive');
      ledger.ar.push({
        id: params.id || `AR-${Date.now().toString().slice(-4)}`,
        customer: params.customer || 'New Customer',
        amount: amt,
        issued: params.issued !== undefined ? Number(params.issued) : 0,
        due: params.due !== undefined ? Number(params.due) : 4
      });
      auditRecord.details = `Added receivable ₹${amt} from ${params.customer}`;
    } else if (action === 'add_payable') {
      const amt = Math.round(Number(params.amount));
      if (amt <= 0) throw new Error('Amount must be positive');
      ledger.ap.push({
        id: params.id || `AP-${Date.now().toString().slice(-4)}`,
        supplier: params.supplier || 'New Supplier',
        amount: amt,
        issued: params.issued !== undefined ? Number(params.issued) : 0,
        due: params.due !== undefined ? Number(params.due) : 6,
        msme: Boolean(params.msme)
      });
      auditRecord.details = `Added payable ₹${amt} to ${params.supplier}`;
    } else if (action === 'pay_gst') {
      const amt = Math.round(Number(params.amount));
      if (amt <= 0) throw new Error('GST payment amount must be positive');
      if (amt > ledger.gst_payable) throw new Error(`Payment ₹${amt} exceeds outstanding GST payable ₹${ledger.gst_payable}`);
      const available = ledger.cash + (ledger.od_limit - ledger.od_used);
      if (available < amt) throw new Error('Insufficient funds to pay GST');
      if (ledger.cash >= amt) {
        ledger.cash -= amt;
      } else {
        const rem = amt - ledger.cash;
        ledger.cash = 0;
        ledger.od_used += rem;
      }
      ledger.gst_payable -= amt;
      auditRecord.details = `Recorded GST payment of ₹${amt}`;
    } else {
      throw new Error('Unknown client action: ' + action);
    }

    // Validate with real validateLedger
    validateLedger(ledger);

    // Persist to ledger.json
    fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2), 'utf8');

    // Sync to business_profile.json
    const profPath = path.join(path.dirname(ledgerFile), 'business_profile.json');
    if (fs.existsSync(profPath)) {
      try {
        const prof = JSON.parse(fs.readFileSync(profPath, 'utf8'));
        prof.cash = ledger.cash;
        prof.od_used = ledger.od_used;
        prof.od_limit = ledger.od_limit;
        prof.gst_payable = ledger.gst_payable;
        prof.receivables = ledger.ar;
        fs.writeFileSync(profPath, JSON.stringify(prof, null, 2), 'utf8');
      } catch {}
    }

    // Append to audit log
    if (auditFile) {
      try {
        fs.appendFileSync(auditFile, JSON.stringify(auditRecord) + '\n');
      } catch {}
    }

    return reset({ seed: s ? s.seed : 1, scenario: s ? s.scenario : 'baseline', strategy: s ? s.strategy : 'constraint_aware', live: true });
  }

  function saveLedger(payload) {
    if (!ledgerFile) throw new Error('No data directory configured');
    validateLedger(payload);
    fs.writeFileSync(ledgerFile, JSON.stringify(payload, null, 2), 'utf8');

    // Also sync to business_profile.json
    const profPath = path.join(path.dirname(ledgerFile), 'business_profile.json');
    if (fs.existsSync(profPath)) {
      try {
        const prof = JSON.parse(fs.readFileSync(profPath, 'utf8'));
        prof.cash = payload.cash;
        prof.od_limit = payload.od_limit;
        prof.od_used = payload.od_used;
        prof.gst_payable = payload.gst_payable;
        prof.receivables = payload.ar;
        fs.writeFileSync(profPath, JSON.stringify(prof, null, 2), 'utf8');
      } catch {}
    }

    // Reload live state
    return reset({ seed: s ? s.seed : 1, scenario: s ? s.scenario : 'baseline', strategy: s ? s.strategy : 'constraint_aware', live: true });
  }



  return { reset, propose, arbitrate, execute, cycle, inject, snapshot, readAudit, startExperiment, job, latestResults, overrideDecision, saveLedger, executeClientAction, chat, getLLMStatus };
}
