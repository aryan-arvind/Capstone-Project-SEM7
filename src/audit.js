// The audit-log view (G): every proposal the Arbiter (or a baseline) has handled, what was checked, the
// outcome and the reason. Records come from data/audit.jsonl through GET /api/msme/audit.
import { AGENTS } from './data.js';
import { money } from './v1data.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const NAMES = { MIN_CASH_BUFFER: 'Cash buffer', OD_LIMIT: 'Overdraft limit', COVENANT_RATIO: 'Covenant ratio', PAYMENT_TERM: '45-day payment rule', INVENTORY_CAPACITY: 'Warehouse capacity' };
const STRAT = { constraint_aware: 'Arbiter', priority_vote: 'Vote', independent: 'No arbiter' };

export function initAudit() {
  const ov = document.getElementById('auditOv'), rowsEl = document.getElementById('auditRows'), meta = document.getElementById('auditMeta');
  const outcome = document.getElementById('auditOutcome'), search = document.getElementById('auditSearch');
  let records = [], isOpen = false;

  function draw() {
    const q = search.value.trim().toLowerCase(), o = outcome.value;
    const list = records.filter(r => (!o || r.outcome === o) && (!q || JSON.stringify([r.agent, r.action_type, r.label, r.reason, r.explanation, r.rationale]).toLowerCase().includes(q)));
    meta.textContent = `${list.length} of ${records.length} decisions`;
    if (!records.length) { rowsEl.innerHTML = '<div class="au-empty">No decisions yet. Run a decision cycle and every proposal lands here.</div>'; return; }
    rowsEl.innerHTML = `<div class="au-row h"><span>Week</span><span>Agent</span><span>Action</span><span class="num">Requested</span><span class="num">Approved</span><span>Outcome</span><span>Constraints checked · reason</span></div>`
      + list.map(r => {
        const a = AGENTS.find(x => x.id === r.agent);
        const dots = (r.constraints_checked || []).map(c => `<i class="${c.passed ? '' : 'f'}" title="${esc(NAMES[c.constraint])}: ${c.passed ? 'passes on its own' : esc(c.detail)}"></i>`).join('');
        const mism = r.claim_mismatch ? ` · agent claimed ${money(r.claimed_cash_impact_inr)}, the books say ${money(r.canonical_cash_impact_inr)}` : '';
        return `<div class="au-row"><span>${r.week}</span><span>${esc(a ? a.name : r.agent)}<div class="au-sub">${esc(STRAT[r.strategy] || r.strategy)} · seed ${r.seed}</div></span>
          <span>${esc(r.label || r.action_type)}<div class="au-sub">week ${r.timing_week} · confidence ${Math.round(r.confidence * 100)}%</div></span>
          <span class="num">${money(r.amount_requested_inr)}</span><span class="num">${money(r.amount_approved_inr)}</span>
          <span class="au-out ${r.outcome}">${r.outcome}</span>
          <span><div class="au-dots">${dots}</div><div>${esc(r.explanation || r.reason)}</div><div class="au-sub">${esc(r.rationale)}${esc(mism)}</div></span></div>`;
      }).join('');
  }
  async function load() {
    try { records = (await (await fetch('/api/msme/audit?limit=600')).json()).records || []; } catch { records = []; }
    draw();
  }
  function open() { if (isOpen) return; isOpen = true; ov.classList.add('on'); document.body.classList.add('auditOpen'); load(); }
  function close() { if (!isOpen) return; isOpen = false; ov.classList.remove('on'); document.body.classList.remove('auditOpen'); }
  document.getElementById('auditClose').addEventListener('click', close);
  document.getElementById('topAudit').addEventListener('click', () => (isOpen ? close() : open()));
  outcome.addEventListener('change', draw); search.addEventListener('input', draw);
  return { open, close, toggle: () => (isOpen ? close() : open()), isOpen: () => isOpen };
}
