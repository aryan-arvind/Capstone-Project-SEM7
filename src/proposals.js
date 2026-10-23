// The proposals panel (right) and the live numbers. A task here is a proposal.
//
//   PROPOSED -> UNDER ARBITRATION -> APPROVED / MODIFIED / REJECTED (or BLOCKED BY CONSTRAINT) -> EXECUTED
//
// Every status is a real phase of the engine (msme/session.mjs, served by serve.mjs under /api/msme):
// "Run decision cycle" calls propose, arbitrate and execute in turn and the rows move as each returns.
// Nothing on this panel is generated in the browser.
import { DEPTS, DEPT_KEYS, AGENTS, ROSTER } from './data.js';
import { setSnapshot } from './ledger.js';
import { money, moneyShort } from './v1data.js';

const API = '/api/msme';
const STATE_LABEL = { proposed: 'Proposed', arbitrating: 'Under arbitration', approved: 'Approved', modified: 'Modified', rejected: 'Rejected', blocked: 'Blocked by constraint', executed: 'Executed' };
const CHIPS = [['all', 'All'], ['proposed', 'Proposed'], ['arbitrating', 'Under arbitration'], ['approved', 'Approved'], ['modified', 'Modified'], ['rejected', 'Rejected'], ['blocked', 'Blocked by constraint'], ['executed', 'Executed']];
const ICON = { proposed: '📝', approved: '✓', modified: '✎', rejected: '✗', blocked: '⛔', executed: '▶' };
const CONSTRAINT_NAME = { MIN_CASH_BUFFER: 'cash buffer', OD_LIMIT: 'overdraft limit', COVENANT_RATIO: 'covenant ratio', PAYMENT_TERM: '45-day rule', INVENTORY_CAPACITY: 'warehouse space' };
const SCENARIOS = [['delayed_receivable', 'Delayed receivable'], ['supplier_price_spike', 'Supplier price spike'], ['demand_surge', 'Demand surge'], ['credit_limit_tightened', 'Tightened credit limit']];
const STRATEGIES = [['constraint_aware', 'Arbiter'], ['priority_vote', 'Priority vote'], ['independent', 'No arbiter']];
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nm = a => a.replace(/_/g, ' ');
const agentOf = id => AGENTS.find(a => a.id === id);

export function initProposals(ctx) {
  const { R, getFocused, enterFocus, pushAgentEvent, onSnapshot } = ctx;
  const panel = document.getElementById('tpanel');
  const q = s => panel.querySelector(s);
  const el = { strategy: q('.pp-strategy'), seed: q('.pp-seed'), reset: q('.pp-reset'), inject: q('.pp-inject'), injbtn: q('.pp-injbtn'), run: q('.pp-run'),
    hint: q('.tp-hint'), chips: q('.tp-chips'), rows: q('.tp-rows'), mode: q('.tp-mode'), scope: q('.tp-scope') };
  const top = document.getElementById('topmetrics');

  let snap = null, filter = 'all', scope = null, busy = false, open = null;
  const rows = new Map();   // every proposal this session, newest cycle first when rendered
  const seen = new Map();   // id -> last state we announced on the desks

  el.strategy.innerHTML = STRATEGIES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  el.inject.innerHTML = '<option value="">Inject a scenario…</option>' + SCENARIOS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');

  const say = (msg, kind = '') => { el.hint.className = 'tp-hint on ' + kind; el.hint.innerHTML = msg; };
  const quiet = () => { el.hint.className = 'tp-hint'; };

  async function call(op, body) {
    const r = await fetch(`${API}/${op}`, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  }

  /* ---------- a snapshot arrives: ledger, top bar, rows, desks ---------- */
  function apply(s) {
    snap = s; setSnapshot(s);
    for (const t of s.tasks) rows.set(t.id, { ...(rows.get(t.id) || {}), ...t, week: parseInt(String(t.id).slice(1), 10), changedAt: Date.now() });
    el.strategy.value = s.strategy; if (document.activeElement !== el.seed) el.seed.value = s.seed;
    el.mode.hidden = false; el.mode.classList.add('live');
    el.mode.textContent = `WEEK ${s.week} · ${s.scenario === 'baseline' ? 'BASELINE' : s.scenario.replace(/_/g, ' ').toUpperCase()}`;
    drawTop(s); announce(s); render(); if (onSnapshot) onSnapshot(s);
  }

  function drawTop(s) {
    const m = s.metrics, c = s.constraints, low = m.cash < c.min_cash_buffer;
    const cell = (l, v, cls = '') => `<span class="tm ${cls}"><i>${l}</i><b>${v}</b></span>`;
    top.innerHTML = cell('WEEK', s.week) + cell('CASH', moneyShort(m.cash), low ? 'bad' : '') + cell('RUNWAY', `${m.runway.toFixed(1)} wk`) + cell('DSO', `${m.dso.toFixed(0)} d`) + cell('DPO', `${m.dpo.toFixed(0)} d`) + cell('CCC', `${m.ccc.toFixed(0)} d`)
      + (s.realized_violations.length ? `<span class="tm bad" title="${esc(s.realized_violations.map(v => v.detail).join('\n'))}"><i>BREACH</i><b>${[...new Set(s.realized_violations.map(v => CONSTRAINT_NAME[v.constraint]))].join(', ')}</b></span>` : '');
    top.title = `${s.strategyLabel} · seed ${s.seed} · overdraft ${moneyShort(s.books.od_used)} of ${moneyShort(s.books.od_limit)}`;
  }

  // a desk reacts the moment a proposal changes status
  function announce(s) {
    for (const t of s.tasks) {
      const last = seen.get(t.id); if (last === t.state) continue;
      seen.set(t.id, t.state);
      const a = agentOf(t.agent); if (!a || !R[a.id]) continue;
      const what = `${nm(t.action_type)} ${money(t.amount_inr)}`;
      if (t.state === 'proposed') pushAgentEvent(a.id, ICON.proposed, `Proposed: ${what}`);
      else if (t.state === 'approved') pushAgentEvent(a.id, ICON.approved, `Approved: ${what}`);
      else if (t.state === 'modified') pushAgentEvent(a.id, ICON.modified, `Modified to ${money(t.amount_approved_inr)}: ${nm(t.action_type)}`);
      else if (t.state === 'rejected') pushAgentEvent(a.id, ICON.rejected, `Rejected: ${what}`);
      else if (t.state === 'blocked') pushAgentEvent(a.id, ICON.blocked, `Blocked by ${t.blocked_by.map(c => CONSTRAINT_NAME[c]).join(', ')}: ${what}`);
    }
    if (s.phase === 'arbitrated' || (s.phase === 'idle' && s.tasks.length)) {
      const key = 'w' + s.week + s.phase; if (seen.get('arb') === key) return; seen.set('arb', key);
      if (s.conflicts.length) pushAgentEvent('arb_conflict', '⚔', `${s.conflicts.length} conflict${s.conflicts.length > 1 ? 's' : ''}: ${s.conflicts[0].detail}`);
      const caught = s.tasks.filter(t => t.blocked_by?.length).length;
      pushAgentEvent('arb_constraint', '⛨', caught ? `${caught} proposal${caught > 1 ? 's' : ''} stopped by a constraint` : 'All constraints hold for the chosen set');
      if (s.tasks.some(t => t.reason)) pushAgentEvent('arb_explain', '✍', `Wrote ${s.tasks.filter(t => t.reason).length} reasons`);
      pushAgentEvent('arbiter_agent', '⚖', `${s.tasks.filter(t => t.outcome === 'approved').length} approved, ${s.tasks.filter(t => t.outcome === 'modified').length} modified, ${s.tasks.filter(t => t.outcome === 'rejected').length} rejected`);
    }
  }

  /* ---------- rendering ---------- */
  const list = () => [...rows.values()].filter(t => (!scope || t.dept === scope) && (filter === 'all' || t.state === filter))
    .sort((a, b) => b.week - a.week || (a.dept > b.dept ? 1 : -1));
  const count = st => [...rows.values()].filter(t => (!scope || t.dept === scope) && (st === 'all' || t.state === st)).length;
  const ago = t => (snap && t.week === snap.week - 1 && snap.phase === 'idle') || (snap && t.week === snap.week) ? 'this cycle' : `wk ${t.week}`;

  function chipsHTML() { return CHIPS.map(([k, l]) => `<button class="tp-chip${filter === k ? ' on' : ''}${k === 'blocked' ? ' w' : ''}" data-f="${k}">${l}<b>${count(k)}</b></button>`).join(''); }
  function rowHTML(t) {
    const a = agentOf(t.agent), d = DEPTS[t.dept];
    const approved = t.state === 'modified' ? `${money(t.amount_approved_inr)} of ${money(t.amount_inr)}` : money(t.amount_inr);
    const why = t.reason ? `<div class="pp-why">${esc(t.reason)}</div>` : '';
    const checks = open === t.id && t.blocked_by ? `<div class="pp-why">${esc(t.rationale)}</div>` : '';
    return `<div class="tp-row pr ${t.state}" data-id="${t.id}" data-agent="${t.agent}">
      <span class="tp-st ${t.state}">${STATE_LABEL[t.state]}</span>
      <div class="tp-body"><div class="tp-t">${esc(t.label || nm(t.action_type))} · ${approved}</div>
        <div class="tp-m">${esc(a ? a.name : t.agent)} · week ${t.timing_week} · conf ${Math.round(t.confidence * 100)}% · claims ${money(t.cash_impact_inr)}</div>${open === t.id || t.state === 'blocked' ? why + checks : ''}</div>
      <span class="tp-ago">${ago(t)}</span></div>`;
  }
  function render() {
    el.scope.textContent = scope ? DEPTS[scope].name : 'WHOLE COMPANY';
    el.chips.innerHTML = chipsHTML();
    const l = list();
    el.rows.innerHTML = l.length ? l.map(rowHTML).join('') : `<div class="tp-empty">${snap ? 'No proposals yet. Run a decision cycle.' : 'Connecting to the engine…'}</div>`;
  }
  el.chips.addEventListener('click', e => { const b = e.target.closest('.tp-chip'); if (b) { filter = b.dataset.f; render(); } });
  el.rows.addEventListener('click', e => {
    const r = e.target.closest('.tp-row'); if (!r) return;
    open = open === r.dataset.id ? null : r.dataset.id; render();
    const a = agentOf(r.dataset.agent); if (a && ctx.openAgent) ctx.openAgent(a.id, 'activity');
  });

  /* ---------- actions ---------- */
  async function guard(label, fn) {
    if (busy) return; busy = true; panel.classList.add('busy');
    try { await fn(); } catch (e) { say(esc(e.message), 'err'); }
    finally { busy = false; panel.classList.remove('busy'); el.run.disabled = false; }
  }
  const pause = ms => new Promise(r => setTimeout(r, ms));

  async function runCycle() {
    await guard('cycle', async () => {
      el.run.disabled = true;
      say('<b>Proposing</b>', 'busy');
      apply(await call('propose', {}));
      await pause(700);
      say('<b>Under arbitration</b> — checking the proposals against the constraints', 'busy');
      apply(await call('arbitrate', {}));
      await pause(900);
      say('<b>Executing</b> the approved actions and advancing the week', 'busy');
      const s = await call('execute', {}); apply(s);
      const ok = s.tasks.filter(t => t.state === 'executed').length, no = s.tasks.length - ok;
      say(`Week ${s.week - 1} done: ${ok} executed, ${no} not. ${s.realized_violations.length ? '<b>Books now breach:</b> ' + [...new Set(s.realized_violations.map(v => CONSTRAINT_NAME[v.constraint]))].join(', ') : 'No constraint is breached.'}`);
    });
  }
  el.run.addEventListener('click', runCycle);
  el.reset.addEventListener('click', () => guard('reset', async () => {
    rows.clear(); seen.clear(); open = null;
    apply(await call('reset', { seed: +el.seed.value || 1, strategy: el.strategy.value }));
    say('New company, week 0. Run a decision cycle.');
  }));
  el.injbtn.addEventListener('click', () => guard('inject', async () => {
    if (!el.inject.value) { say('Pick a scenario to inject first.', 'err'); return; }
    const name = el.inject.options[el.inject.selectedIndex].text;
    apply(await call('inject', { type: el.inject.value }));
    say(`<b>${esc(name)}</b> injected at week ${snap.week}. It hits the books in the next cycle; the agents and the Arbiter cannot see it coming.`);
    el.inject.value = '';
  }));

  async function refresh() {
    try { apply(await call('state')); quiet(); }
    catch { rows.clear(); el.mode.hidden = true; say('The engine is not running. Start it with <b>npm start</b> and open http://localhost:4520.', 'err'); render(); }
  }

  /* ---------- what a desk agent can say about its own work ---------- */
  function handleChat(agentId, text) {
    const a = agentOf(agentId); if (!a) return null;
    const mine = [...rows.values()].filter(t => t.agent === agentId).sort((x, y) => y.week - x.week);
    if (!a.lead) return `${a.does} I am a desk inside ${DEPTS[a.dept].short} and make no model call of my own; ask ${ROSTER.departments.find(d => d.key === a.dept).agent.name} about the proposals.`;
    if (!mine.length) return 'I have not proposed anything yet. Press RUN DECISION CYCLE.';
    const lastWeek = mine[0].week, cur = mine.filter(t => t.week === lastWeek);
    const line = t => `• ${nm(t.action_type)} ${money(t.amount_inr)} → ${STATE_LABEL[t.state].toLowerCase()}${t.state === 'modified' ? ` (${money(t.amount_approved_inr)})` : ''}`;
    if (/why|reject|block|modif|reason/i.test(text)) {
      const no = cur.filter(t => t.state !== 'approved' && t.state !== 'executed' || t.reason);
      return no.length ? no.map(t => `${line(t)}\n   ${t.reason || t.rationale}`).join('\n') : 'Everything I proposed this week went through as asked.';
    }
    if (/worr|risk|concern|constraint/i.test(text)) {
      const b = [...new Set(mine.flatMap(t => t.blocked_by || []))];
      return b.length ? `The constraints that have stopped my proposals: ${b.map(c => CONSTRAINT_NAME[c]).join(', ')}.` : 'None of my proposals has hit a hard constraint so far.';
    }
    return `Week ${lastWeek}, what I proposed:\n${cur.map(line).join('\n')}`;
  }

  /* ---------- the interface main.js expects ---------- */
  const noop = () => {};
  return {
    tick: noop, toggle: noop, open: noop, close: noop, isOpen: () => false, boardWidth: () => 0, calendar: null,
    openFor: k => { if (getFocused() !== k) enterFocus(k); },
    setDept: k => { scope = k; render(); },
    onFocusChange: k => { scope = k || null; render(); },
    onStuck: noop, onResolve: noop, rowHTML: () => '', syncPills: noop, railFor: noop, refresh,
    pendingReject: () => false, rejectLive: noop, resolveLive: noop, revise: () => false, addTask: () => null, addRoutine: noop, rtAct: noop,
    handleChat, panelWidth: () => panel.offsetWidth, isLive: () => false, tasks: [], routines: [],
    snapshot: () => snap, run: runCycle, apply,
  };
}
