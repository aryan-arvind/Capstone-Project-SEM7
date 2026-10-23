// The experiment-results view (E): run N seeds x scenarios x strategies on the server and read the
// summary (means with 95% intervals, paired comparison of the Arbiter against each baseline).
// The full per-episode data is downloaded as results.csv / results.json; scripts/plots.py draws the figures.
import { money } from './v1data.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SCEN = [['baseline', 'Baseline'], ['delayed_receivable', 'Delayed receivable'], ['supplier_price_spike', 'Supplier price spike'], ['demand_surge', 'Demand surge'], ['credit_limit_tightened', 'Tightened credit limit']];
const STRAT = [['independent', 'No arbiter'], ['priority_vote', 'Priority vote'], ['constraint_aware', 'Constraint-aware Arbiter']];
const COLOUR = { independent: '#8c8c8c', priority_vote: '#e69f00', constraint_aware: '#0072b2' };
const half = s => (s.ci95[1] - s.ci95[0]) / 2;
const fmtRate = s => `${s.mean.toFixed(2)} <span class="ci">±${half(s).toFixed(2)}</span>`;
const fmtInr = s => `${money(s.mean)} <span class="ci">±${money(half(s))}</span>`;
const fmtNum = (s, d = 0) => `${s.mean.toFixed(d)} <span class="ci">±${half(s).toFixed(d)}</span>`;

export function initExperiments() {
  const ov = document.getElementById('expOv'), formEl = document.getElementById('expForm'), out = document.getElementById('expOut'), meta = document.getElementById('expMeta');
  let isOpen = false, timer = null, running = false;

  formEl.innerHTML = `<div class="ex-form">
    <label>Seeds<input type="number" id="exSeeds" min="1" max="200" value="30"></label>
    <label>Weeks per episode<input type="number" id="exWeeks" min="4" max="52" value="12"></label>
    <label>Agents<select id="exMode"><option value="mock">Rule-based (free, reproducible)</option><option value="llm">Claude (slow, uses your plan)</option></select></label>
    <label>Scenarios<div class="ex-checks">${SCEN.map(([k, l]) => `<span><input type="checkbox" class="exScn" value="${k}" checked>${l}</span>`).join('')}</div></label>
    <label>Strategies<div class="ex-checks">${STRAT.map(([k, l]) => `<span><input type="checkbox" class="exStr" value="${k}" checked>${l}</span>`).join('')}</div></label>
    <button class="ex-go" id="exGo">RUN EXPERIMENT</button></div><div id="exProg"></div>`;
  const prog = formEl.querySelector('#exProg'), go = formEl.querySelector('#exGo');
  const checked = cls => [...formEl.querySelectorAll('.' + cls + ':checked')].map(x => x.value);

  async function run() {
    if (running) return;
    const body = { seeds: +formEl.querySelector('#exSeeds').value || 10, weeks: +formEl.querySelector('#exWeeks').value || 12, mode: formEl.querySelector('#exMode').value, scenarios: checked('exScn'), strategies: checked('exStr'), explain: false };
    if (!body.scenarios.length || !body.strategies.length) { prog.innerHTML = '<div class="ex-note">Pick at least one scenario and one strategy.</div>'; return; }
    running = true; go.disabled = true; prog.innerHTML = '<div class="ex-bar"><i style="width:0"></i></div>';
    try {
      const r = await fetch('/api/msme/experiments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const { id, error } = await r.json(); if (error) throw new Error(error);
      await new Promise((resolve, reject) => {
        timer = setInterval(async () => {
          try {
            const j = await (await fetch('/api/msme/experiments/' + id)).json();
            prog.innerHTML = `<div class="ex-note">${j.done} of ${j.total || '…'} episodes</div><div class="ex-bar"><i style="width:${j.total ? Math.round(j.done / j.total * 100) : 0}%"></i></div>`;
            if (j.state === 'done') { clearInterval(timer); show(j.summary); prog.innerHTML = '<div class="ex-note">Done. Per-episode data written to results/results.csv and results.json.</div>'; resolve(); }
            if (j.state === 'error') { clearInterval(timer); reject(new Error(j.error)); }
          } catch (e) { clearInterval(timer); reject(e); }
        }, 700);
      });
    } catch (e) { prog.innerHTML = `<div class="ex-note">${esc(e.message)}</div>`; }
    running = false; go.disabled = false;
  }
  go.addEventListener('click', run);

  function show(r) {
    meta.textContent = `${r.meta.seeds} seeds · ${r.meta.episode_weeks} weeks · ${r.meta.mode === 'mock' ? 'rule-based agents' : 'Claude agents'}`;
    const scs = r.meta.scenarios, strs = STRAT.map(s => s[0]).filter(k => r.meta.strategies.includes(k));
    const cell = (sc, st) => r.summary.find(s => s.scenario === sc && s.strategy === st);
    const head = '<tr><th>Scenario</th><th>Strategy</th><th>Violation rate</th><th>Min cash (Rs)</th><th>Stock-outs</th><th>CCC (days)</th><th>Ending cash (Rs)</th><th>Profit (Rs)</th><th>Tokens / cycle</th></tr>';
    const body = scs.map(sc => strs.map((st, i) => { const c = cell(sc, st); return `<tr class="${st === 'constraint_aware' ? 'arb' : ''}"><td>${i === 0 ? esc(SCEN.find(x => x[0] === sc)[1]) : ''}</td><td>${esc(STRAT.find(x => x[0] === st)[1])}</td>
      <td>${fmtRate(c.violation_rate)}</td><td>${fmtInr(c.min_cash_inr)}</td><td>${fmtNum(c.stockout_units)}</td><td>${fmtNum(c.ccc_days, 1)}</td><td>${fmtInr(c.ending_cash_inr)}</td><td>${fmtInr(c.profit_inr)}</td><td>${fmtNum(c.tokens_per_cycle)}</td></tr>`; }).join('')).join('');
    const bars = scs.map(sc => `<div class="ex-bars">${strs.map(st => { const c = cell(sc, st).violation_rate; return `<span>${esc(SCEN.find(x => x[0] === sc)[1])} · ${esc(STRAT.find(x => x[0] === st)[1])}</span><span><div class="b" style="width:${Math.max(1, Math.round(c.mean * 100))}%;background:${COLOUR[st]}"></div></span><span>${c.mean.toFixed(2)}</span>`; }).join('')}</div>`).join('');
    let paired = '';
    if (strs.includes('constraint_aware')) {
      paired = scs.map(sc => strs.filter(s => s !== 'constraint_aware').map(b => {
        const c = r.comparisons[sc]?.[b]; if (!c) return '';
        const v = c.violation_rate, p = c.profit_inr, so = c.stockout_units;
        const sig = x => (x.ci95[0] > 0 || x.ci95[1] < 0) ? '' : ' (not significant)';
        return `<li><b>${esc(SCEN.find(x => x[0] === sc)[1])}</b> vs ${esc(STRAT.find(x => x[0] === b)[1])}: violation rate ${v.mean >= 0 ? '+' : ''}${v.mean.toFixed(2)}${sig(v)}, lower on ${v.wins_a}/${v.pairs} seeds · stock-outs ${so.mean >= 0 ? '+' : ''}${Math.round(so.mean)}${sig(so)} · profit ${p.mean >= 0 ? '+' : '−'}${money(Math.abs(p.mean))}${sig(p)}</li>`;
      }).join('')).join('');
    }
    out.innerHTML = `<div class="ex-h">Results (mean ± half-width of the 95% interval)</div><table class="ex-table">${head}${body}</table>
      <div class="ex-h">Violation rate</div>${bars}
      ${paired ? `<div class="ex-h">Paired on the same seeds: Arbiter minus baseline</div><ul class="ex-paired">${paired}</ul>` : ''}`;
  }

  async function loadLatest() {
    try { const r = await (await fetch('/api/msme/results')).json(); if (r && !r.none) show(r); else out.innerHTML = '<div class="ex-note">No results yet. Set the options above and run an experiment.</div>'; }
    catch { out.innerHTML = '<div class="ex-note">The engine is not running.</div>'; }
  }
  function open() { if (isOpen) return; isOpen = true; ov.classList.add('on'); loadLatest(); }
  function close() { if (!isOpen) return; isOpen = false; ov.classList.remove('on'); }
  document.getElementById('expClose').addEventListener('click', close);
  document.getElementById('topExp').addEventListener('click', () => (isOpen ? close() : open()));
  return { open, close, toggle: () => (isOpen ? close() : open()), isOpen: () => isOpen };
}
