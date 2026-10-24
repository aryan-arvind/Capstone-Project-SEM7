// Client Dashboard view: Overview KPIs, Editable AR/AP/Inventory tables,
// Human-in-the-loop Agent Decisions with source badges, Free-text Scenarios,
// Chat with Finance Team, Real Client Actions, and Digitizer integration.
import { money } from './v1data.js';

let activeTab = 'overview';
let currentSnapshot = null;
let currentLedger = null;
let switchViewCallback = null;
let llmStatus = { mode: 'off', last_provider: 'rule-fallback', fallback_count: 0 };
let chatHistory = [];
let isChatBusy = false;

let digitizeState = {
  loading: false,
  docType: 'INVOICE',
  filename: '',
  columns: [],
  rows: [],
  error: null,
  successMsg: null
};

const inr = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function initDashboard({ onRunCycle, onSwitchView }) {
  switchViewCallback = onSwitchView;
  const dashEl = document.getElementById('clientDashboard');
  if (!dashEl) return;

  // Tab switching
  dashEl.querySelectorAll('.cd-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      dashEl.querySelectorAll('.cd-tab').forEach(t => t.classList.remove('on'));
      tab.classList.add('on');
      activeTab = tab.dataset.tab;
      renderActiveTab();
    });
  });

  fetchLLMStatus();
  fetchLedger();
}

export function updateDashboardState(snap) {
  currentSnapshot = snap;
  if (!currentLedger && snap) {
    fetchLedger();
  }
  fetchLLMStatus();
  renderActiveTab();
}

async function fetchLLMStatus() {
  try {
    const res = await fetch('/api/msme/llm-status?t=' + Date.now());
    if (res.ok) {
      llmStatus = await res.json();
      updateLLMBadge();
    }
  } catch {}
}

function updateLLMBadge() {
  const badge = document.getElementById('dashLLMBadge');
  if (badge) {
    if (llmStatus.mode === 'on') {
      badge.textContent = `LLM ON (${llmStatus.last_provider || 'groq'})`;
      badge.className = 'cd-pill live';
    } else {
      badge.textContent = 'LLM OFF - rule fallback';
      badge.className = 'cd-pill';
    }
  }
}

async function fetchLedger() {
  try {
    const res = await fetch('/data/ledger.json?t=' + Date.now());
    if (res.ok) {
      currentLedger = await res.json();
      renderActiveTab();
    }
  } catch {}
}

function renderActiveTab() {
  const body = document.getElementById('cdBody');
  if (!body) return;

  switch (activeTab) {
    case 'overview':
      body.innerHTML = renderOverview();
      attachOverviewEvents();
      break;
    case 'ar':
      body.innerHTML = renderARTable();
      attachAREvents();
      break;
    case 'ap':
      body.innerHTML = renderAPTable();
      attachAPEvents();
      break;
    case 'inv':
      body.innerHTML = renderInventory();
      attachInvEvents();
      break;
    case 'decisions':
      body.innerHTML = renderDecisions();
      attachDecisionEvents();
      break;
    case 'scenarios':
      body.innerHTML = renderScenarios();
      attachScenarioEvents();
      break;
    case 'chat':
      body.innerHTML = renderChat();
      attachChatEvents();
      break;
    case 'digitize':
      body.innerHTML = renderDigitize();
      attachDigitizeEvents();
      break;
  }
  updateLLMBadge();
}

function renderOverview() {
  const m = currentSnapshot?.metrics || { cash: 0, runway: 0, dso: 0, dpo: 0, ccc: 0 };
  const b = currentSnapshot?.books || { ar: 0, ap: 0, inventory_units: 0, od_used: 0, od_limit: 0, gst_payable: 0 };
  const isLive = currentSnapshot?.mode === 'live';

  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Executive Financial Overview</h2>
        <div style="display:flex;gap:8px;align-items:center;">
          <span id="dashLLMBadge" class="cd-pill ${llmStatus.mode === 'on' ? 'live' : ''}">
            ${llmStatus.mode === 'on' ? `LLM ON (${llmStatus.last_provider})` : 'LLM OFF - rule fallback'}
          </span>
          <span class="cd-pill ${isLive ? 'live' : ''}">${isLive ? '● REAL OPENING BOOKS' : '○ SYNTHETIC MODEL'}</span>
        </div>
      </div>
      <div class="cd-kpi-grid">
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Cash on Hand</span><span class="kpi-src">Profile</span></div>
          <div class="kpi-val">${inr(m.cash)}</div>
          <div class="kpi-sub">Buffer floor: ${inr(currentSnapshot?.constraints?.min_cash_buffer || 300000)}</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Overdraft Facility</span><span class="kpi-src">Profile</span></div>
          <div class="kpi-val">${inr(b.od_used)}</div>
          <div class="kpi-sub">Limit: ${inr(b.od_limit)} (Available: ${inr(b.od_limit - b.od_used)})</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Cash Runway</span><span class="kpi-src">Derived</span></div>
          <div class="kpi-val">${m.runway ? m.runway.toFixed(1) : 0} wks</div>
          <div class="kpi-sub">Weekly burn: ~${inr(70000)}</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Receivables (AR)</span><span class="kpi-src">Profile</span></div>
          <div class="kpi-val">${inr(b.ar)}</div>
          <div class="kpi-sub">DSO: ${m.dso ? m.dso.toFixed(1) : 0} days</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Payables (AP)</span><span class="kpi-src">SQLite</span></div>
          <div class="kpi-val">${inr(b.ap)}</div>
          <div class="kpi-sub">DPO: ${m.dpo ? m.dpo.toFixed(1) : 0} days</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Cash Conversion Cycle</span><span class="kpi-src">Derived</span></div>
          <div class="kpi-val">${m.ccc ? m.ccc.toFixed(1) : 0} days</div>
          <div class="kpi-sub">DIO: ${m.dio ? m.dio.toFixed(1) : 0} days</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Inventory Units</span><span class="kpi-src">SQLite</span></div>
          <div class="kpi-val">${b.inventory_units?.toLocaleString('en-IN') || 0}</div>
          <div class="kpi-sub">Valued at ~${inr(currentLedger?.inventory?.unit_cost ? b.inventory_units * currentLedger.inventory.unit_cost : 0)}</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">GST Payable</span><span class="kpi-src">Profile</span></div>
          <div class="kpi-val">${inr(b.gst_payable)}</div>
          <div class="kpi-sub">Statutory tax liability</div>
        </div>
      </div>

      <div class="cd-card" style="margin-top:16px;">
        <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--ink);">Quick Statutory Payment:</div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span>Outstanding GST: <strong>${inr(b.gst_payable)}</strong></span>
          <input id="inpGstAmount" type="number" placeholder="Amount (₹)" value="${b.gst_payable}" style="padding:4px 8px;font-family:inherit;font-size:12px;width:120px;">
          <button id="btnPayGstQuick" class="cd-btn primary" style="background:#28a745;color:#fff;">Pay GST</button>
        </div>
      </div>
    </div>
  `;
}

function attachOverviewEvents() {
  document.getElementById('btnPayGstQuick')?.addEventListener('click', async () => {
    const val = Number(document.getElementById('inpGstAmount')?.value);
    if (!val || val <= 0) return alert('Please enter a valid positive amount');
    await callClientAction('pay_gst', { amount: val });
  });
}

function renderARTable() {
  const ar = currentLedger?.ar || [];
  const total = ar.reduce((s, r) => s + (r.amount || 0), 0);

  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Accounts Receivable (AR)</h2>
        <span class="cd-pill live">Total: ${inr(total)}</span>
      </div>
      <p style="color:var(--grey);font-size:13px;margin:4px 0 16px 0;">
        Pending client invoices. Click <strong>Mark Paid</strong> to record customer receipt (increases cash, reduces AR).
      </p>

      <div class="cd-card" style="margin-bottom:16px;">
        <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--ink);">+ Add New Customer Receivable:</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <input id="newArId" placeholder="Invoice ID (e.g. INV-201)" style="padding:4px 8px;font-size:12px;width:120px;">
          <input id="newArCust" placeholder="Customer Name" style="padding:4px 8px;font-size:12px;width:160px;">
          <input id="newArAmt" type="number" placeholder="Amount (₹)" style="padding:4px 8px;font-size:12px;width:110px;">
          <input id="newArDue" type="number" placeholder="Due Wk" value="4" style="padding:4px 8px;font-size:12px;width:70px;">
          <button id="btnAddAr" class="cd-btn primary">+ Add to Books</button>
        </div>
      </div>

      <div class="cd-card">
        <table class="cd-table" id="arTable">
          <thead>
            <tr>
              <th>Invoice ID</th>
              <th>Customer</th>
              <th>Amount (₹)</th>
              <th>Issued Wk</th>
              <th>Due Wk</th>
              <th>Action</th>
              <th style="width:30px;"></th>
            </tr>
          </thead>
          <tbody>
            ${ar.length ? ar.map((row, idx) => `
              <tr data-idx="${idx}">
                <td><input class="ar-id" value="${esc(row.id || '')}"></td>
                <td><input class="ar-cust" value="${esc(row.customer || '')}"></td>
                <td><input class="ar-amt" type="number" value="${row.amount || 0}"></td>
                <td><input class="ar-issued" type="number" value="${row.issued ?? 0}"></td>
                <td><input class="ar-due" type="number" value="${row.due ?? 0}"></td>
                <td><button class="cd-btn-sm btn-mark-paid" data-id="${esc(row.id)}" data-cust="${esc(row.customer)}" data-amt="${row.amount}">✓ Mark Paid</button></td>
                <td><button class="cd-del-btn btn-del-ar" data-idx="${idx}">✕</button></td>
              </tr>
            `).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--grey);">No receivables in current ledger</td></tr>'}
          </tbody>
        </table>
        <div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;">
          <button id="btnSaveAR" class="cd-btn primary">Save Changes to Ledger</button>
        </div>
      </div>
    </div>
  `;
}

function attachAREvents() {
  document.getElementById('btnAddAr')?.addEventListener('click', async () => {
    const id = document.getElementById('newArId')?.value?.trim();
    const cust = document.getElementById('newArCust')?.value?.trim();
    const amt = Number(document.getElementById('newArAmt')?.value);
    const due = Number(document.getElementById('newArDue')?.value || 4);
    if (!amt || amt <= 0) return alert('Please enter a positive amount');
    await callClientAction('add_receivable', { id, customer: cust, amount: amt, due });
  });

  document.querySelectorAll('.btn-mark-paid').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const cust = btn.dataset.cust;
      const amount = Number(btn.dataset.amt);
      await callClientAction('mark_receivable_paid', { id, customer: cust, amount });
    });
  });

  document.querySelectorAll('.btn-del-ar').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = +e.target.dataset.idx;
      if (currentLedger?.ar) {
        currentLedger.ar.splice(idx, 1);
        renderActiveTab();
      }
    });
  });

  document.getElementById('btnSaveAR')?.addEventListener('click', () => {
    collectARFromDOM();
    saveLedgerChanges();
  });
}

function collectARFromDOM() {
  const rows = document.querySelectorAll('#arTable tbody tr');
  const items = [];
  rows.forEach(r => {
    const id = r.querySelector('.ar-id')?.value;
    const customer = r.querySelector('.ar-cust')?.value;
    const amount = Number(r.querySelector('.ar-amt')?.value || 0);
    const issued = Number(r.querySelector('.ar-issued')?.value || 0);
    const due = Number(r.querySelector('.ar-due')?.value || 0);
    if (amount > 0) items.push({ id, customer, amount, issued, due });
  });
  if (currentLedger) currentLedger.ar = items;
}

function renderAPTable() {
  const ap = currentLedger?.ap || [];
  const total = ap.reduce((s, r) => s + (r.amount || 0), 0);

  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Accounts Payable (AP)</h2>
        <span class="cd-pill live">Total: ${inr(total)}</span>
      </div>
      <p style="color:var(--grey);font-size:13px;margin:4px 0 16px 0;">
        Supplier bills & obligations. Click <strong>Pay Bill</strong> to settle invoice (reduces cash, reduces AP).
      </p>

      <div class="cd-card" style="margin-bottom:16px;">
        <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--ink);">+ Add New Supplier Payable:</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <input id="newApId" placeholder="Bill ID (e.g. AP-301)" style="padding:4px 8px;font-size:12px;width:120px;">
          <input id="newApSupp" placeholder="Supplier Name" style="padding:4px 8px;font-size:12px;width:160px;">
          <input id="newApAmt" type="number" placeholder="Amount (₹)" style="padding:4px 8px;font-size:12px;width:110px;">
          <input id="newApDue" type="number" placeholder="Due Wk" value="6" style="padding:4px 8px;font-size:12px;width:70px;">
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="newApMsme"> MSME Vendor</label>
          <button id="btnAddAp" class="cd-btn primary">+ Add to Books</button>
        </div>
      </div>

      <div class="cd-card">
        <table class="cd-table" id="apTable">
          <thead>
            <tr>
              <th>Invoice ID</th>
              <th>Supplier</th>
              <th>Amount (₹)</th>
              <th>Issued Wk</th>
              <th>Due Wk</th>
              <th>MSME?</th>
              <th>Action</th>
              <th style="width:30px;"></th>
            </tr>
          </thead>
          <tbody>
            ${ap.length ? ap.map((row, idx) => `
              <tr data-idx="${idx}">
                <td><input class="ap-id" value="${esc(row.id || '')}"></td>
                <td><input class="ap-supp" value="${esc(row.supplier || '')}"></td>
                <td><input class="ap-amt" type="number" value="${row.amount || 0}"></td>
                <td><input class="ap-issued" type="number" value="${row.issued ?? 0}"></td>
                <td><input class="ap-due" type="number" value="${row.due ?? 0}"></td>
                <td style="text-align:center;"><input class="ap-msme" type="checkbox" ${row.msme ? 'checked' : ''}></td>
                <td><button class="cd-btn-sm btn-pay-bill" data-id="${esc(row.id)}" data-supp="${esc(row.supplier)}" data-amt="${row.amount}">💳 Pay Bill</button></td>
                <td><button class="cd-del-btn btn-del-ap" data-idx="${idx}">✕</button></td>
              </tr>
            `).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--grey);">No payables in current ledger</td></tr>'}
          </tbody>
        </table>
        <div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;">
          <button id="btnSaveAP" class="cd-btn primary">Save Changes to Ledger</button>
        </div>
      </div>
    </div>
  `;
}

function attachAPEvents() {
  document.getElementById('btnAddAp')?.addEventListener('click', async () => {
    const id = document.getElementById('newApId')?.value?.trim();
    const supp = document.getElementById('newApSupp')?.value?.trim();
    const amt = Number(document.getElementById('newApAmt')?.value);
    const due = Number(document.getElementById('newApDue')?.value || 6);
    const msme = document.getElementById('newApMsme')?.checked;
    if (!amt || amt <= 0) return alert('Please enter a positive amount');
    await callClientAction('add_payable', { id, supplier: supp, amount: amt, due, msme });
  });

  document.querySelectorAll('.btn-pay-bill').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const supp = btn.dataset.supp;
      const amount = Number(btn.dataset.amt);
      await callClientAction('pay_payable', { id, supplier: supp, amount });
    });
  });

  document.querySelectorAll('.btn-del-ap').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = +e.target.dataset.idx;
      if (currentLedger?.ap) {
        currentLedger.ap.splice(idx, 1);
        renderActiveTab();
      }
    });
  });

  document.getElementById('btnSaveAP')?.addEventListener('click', () => {
    collectAPFromDOM();
    saveLedgerChanges();
  });
}

function collectAPFromDOM() {
  const rows = document.querySelectorAll('#apTable tbody tr');
  const items = [];
  rows.forEach(r => {
    const id = r.querySelector('.ap-id')?.value;
    const supplier = r.querySelector('.ap-supp')?.value;
    const amount = Number(r.querySelector('.ap-amt')?.value || 0);
    const issued = Number(r.querySelector('.ap-issued')?.value || 0);
    const due = Number(r.querySelector('.ap-due')?.value || 0);
    const msme = r.querySelector('.ap-msme')?.checked || false;
    if (amount > 0) items.push({ id, supplier, amount, issued, due, msme });
  });
  if (currentLedger) currentLedger.ap = items;
}

function renderInventory() {
  const inv = currentLedger?.inventory || { units: 0, unit_cost: 0 };
  const overrides = currentLedger?.sim_overrides || {};

  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Inventory & Unit Economics</h2>
        <span class="cd-pill live">Units: ${inv.units?.toLocaleString('en-IN') || 0}</span>
      </div>
      <div class="cd-card">
        <div class="cd-form-grid">
          <div class="cd-field">
            <label>Current Stock (Units)</label>
            <input id="invUnits" type="number" value="${inv.units || 0}">
          </div>
          <div class="cd-field">
            <label>Weighted Unit Cost (₹)</label>
            <input id="invUnitCost" type="number" value="${inv.unit_cost || 0}">
          </div>
          <div class="cd-field">
            <label>Finished Goods Sale Price (₹)</label>
            <input id="invPrice" type="number" value="${overrides.price || 520}">
          </div>
          <div class="cd-field">
            <label>Weekly Demand Base (Units)</label>
            <input id="invDemand" type="number" value="${overrides.base_demand_units || 150}">
          </div>
        </div>
        <div style="margin-top:16px;">
          <button id="btnSaveInv" class="cd-btn primary">Save Inventory Parameters</button>
        </div>
      </div>
    </div>
  `;
}

function attachInvEvents() {
  document.getElementById('btnSaveInv')?.addEventListener('click', () => {
    if (currentLedger) {
      currentLedger.inventory = currentLedger.inventory || {};
      currentLedger.sim_overrides = currentLedger.sim_overrides || {};
      currentLedger.inventory.units = Number(document.getElementById('invUnits')?.value || 0);
      currentLedger.inventory.unit_cost = Number(document.getElementById('invUnitCost')?.value || 0);
      currentLedger.sim_overrides.price = Number(document.getElementById('invPrice')?.value || 520);
      currentLedger.sim_overrides.base_demand_units = Number(document.getElementById('invDemand')?.value || 150);
      saveLedgerChanges();
    }
  });
}

function renderDecisions() {
  const tasks = currentSnapshot?.tasks || [];
  const cycleWeek = currentSnapshot?.week || 0;

  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Agent Discussion & Arbitration Timeline</h2>
        <span class="cd-pill live">Cycle Week ${cycleWeek}</span>
      </div>
      <p style="color:var(--grey);font-size:13px;margin:4px 0 16px 0;">
        Chronological audit of multi-agent recommendations, Arbiter conflict resolution, and deterministic verifier guardrails.
      </p>

      <div style="display:flex;flex-direction:column;gap:12px;">
        ${tasks.length ? tasks.map(t => {
          const isLlm = (t.source || '').startsWith('llm');
          return `
            <div class="cd-card" style="border-left:4px solid ${t.state === 'executed' || t.state === 'approved' ? '#28a745' : t.state === 'rejected' ? '#d9534f' : '#f0ad4e'};">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <div style="display:flex;gap:8px;align-items:center;">
                  <span style="font-weight:700;font-size:13px;text-transform:uppercase;color:var(--ink);">${esc(t.dept)} (${esc(t.agent)})</span>
                  <span class="source-badge ${isLlm ? 'llm' : 'rules'}">${esc(t.source || 'rule-fallback')}</span>
                  <span style="font-size:11px;color:var(--grey);">Confidence: ${Math.round((t.confidence || 0) * 100)}%</span>
                </div>
                <div>
                  <span class="state-pill ${t.state}">${esc(t.state?.toUpperCase() || 'PROPOSED')}</span>
                </div>
              </div>

              <div style="font-size:13px;font-weight:600;margin-bottom:4px;">
                Action: <code>${esc(t.action_type)}</code> · Requested: ${inr(t.amount_inr)}
                ${t.amount_approved_inr !== null && t.amount_approved_inr !== undefined ? `· Approved: <strong>${inr(t.amount_approved_inr)}</strong>` : ''}
              </div>

              <div style="font-size:12px;color:var(--grey);margin-bottom:6px;background:rgba(0,0,0,0.03);padding:6px 10px;border-radius:4px;">
                <em>Agent Reasoning:</em> "${esc(t.rationale || 'Rule-based trigger')}"
              </div>

              ${t.reason ? `
                <div style="font-size:12px;color:var(--ink);margin-bottom:6px;">
                  <strong>Arbiter Verdict:</strong> ${esc(t.reason)}
                  ${t.blocked_by?.length ? `<span style="color:#d9534f;margin-left:6px;">[Guardrail Block: ${esc(t.blocked_by.join(', '))}]</span>` : ''}
                </div>
              ` : ''}

              <div style="display:flex;gap:6px;margin-top:8px;">
                <button class="cd-btn-sm btn-override-app" data-id="${t.id}" style="color:#28a745;">✓ Force Approve</button>
                <button class="cd-btn-sm btn-override-rej" data-id="${t.id}" style="color:#d9534f;">✕ Force Reject</button>
              </div>
            </div>
          `;
        }).join('') : '<div class="cd-card" style="text-align:center;color:var(--grey);">No proposals in current cycle. Run a decision cycle to see proposals.</div>'}
      </div>
    </div>
  `;
}

function attachDecisionEvents() {
  document.querySelectorAll('.btn-override-app').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      await fetch('/api/msme/decision/override', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, outcome: 'approved' })
      });
      const res = await (await fetch('/api/msme/state')).json();
      updateDashboardState(res);
    });
  });

  document.querySelectorAll('.btn-override-rej').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      await fetch('/api/msme/decision/override', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, outcome: 'rejected' })
      });
      const res = await (await fetch('/api/msme/state')).json();
      updateDashboardState(res);
    });
  });
}

function renderScenarios() {
  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Macro & Supply Chain Scenarios</h2>
        <span class="cd-pill">ACTIVE: ${currentSnapshot?.scenario?.toUpperCase() || 'BASELINE'}</span>
      </div>
      <p style="color:var(--grey);font-size:13px;margin:4px 0 16px 0;">
        Inject unpredictable financial shocks. The agents and Arbiter will adjust their recommendations to protect solvency.
      </p>

      <div class="cd-card" style="margin-bottom:16px;">
        <div style="font-weight:600;font-size:14px;margin-bottom:6px;color:var(--ink);">Free-Text Custom Scenario Shock:</div>
        <p style="font-size:12px;color:var(--grey);margin:0 0 10px 0;">
          Describe any external crisis or event. This raw situation text is passed directly into the LLM prompts of all 6 department agents and the central Arbiter.
        </p>
        <textarea id="txtCustomScenario" rows="3" placeholder="Describe a situation (e.g. Major automotive OEM client requests 60-day credit extension, supplier raw material prices hike by 25%, flash flood delays logistics by 3 weeks)..." style="width:100%;font-family:inherit;font-size:13px;padding:8px;border:1px solid var(--hairline);border-radius:4px;box-sizing:border-box;"></textarea>
        <div style="display:flex;gap:10px;margin-top:10px;">
          <button id="btnInjectCustom" class="cd-btn">INJECT SHOCK</button>
          <button id="btnRunCustomCycle" class="cd-btn primary">⚡ INJECT & RUN CYCLE</button>
        </div>
      </div>

      <div class="cd-card">
        <div style="font-weight:600;font-size:14px;margin-bottom:6px;color:var(--ink);">Preset Macro Scenarios:</div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <select id="selPresetScenario" style="padding:6px 12px;font-family:inherit;font-size:13px;border:1px solid var(--hairline);border-radius:4px;">
            <option value="">-- Choose Preset Scenario --</option>
            <option value="delayed_receivable">Delayed Receivables (Big client holds payments)</option>
            <option value="supplier_price_hike">Supplier Price Hike (Input raw material spike)</option>
            <option value="demand_surge">Demand Surge (30% sudden sales spike)</option>
            <option value="credit_limit_tightened">Credit Tightened (Bank slashes overdraft limit)</option>
            <option value="revenue_shock">Revenue Shock (Order cancellations)</option>
            <option value="cost_inflation">Cost Inflation (Utility & wage increases)</option>
            <option value="compound_stress">Compound Stress (Simultaneous price spike & credit cut)</option>
          </select>
          <button id="btnInjectPreset" class="cd-btn">INJECT PRESET</button>
          <button id="btnRunDashCycle" class="cd-btn primary">RUN DECISION CYCLE</button>
        </div>
      </div>
    </div>
  `;
}

function attachScenarioEvents() {
  document.getElementById('btnInjectCustom')?.addEventListener('click', async () => {
    const text = document.getElementById('txtCustomScenario')?.value?.trim();
    if (!text) return alert('Please enter scenario text');
    await fetch('/api/msme/inject', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'custom', text })
    });
    alert('Injected custom shock: ' + text);
    const res = await (await fetch('/api/msme/state')).json();
    updateDashboardState(res);
  });

  document.getElementById('btnRunCustomCycle')?.addEventListener('click', async () => {
    const text = document.getElementById('txtCustomScenario')?.value?.trim();
    if (!text) return alert('Please enter scenario text');
    await fetch('/api/msme/inject', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'custom', text })
    });
    runCycleWith3DTransition();
  });

  document.getElementById('btnInjectPreset')?.addEventListener('click', async () => {
    const sel = document.getElementById('selPresetScenario');
    if (!sel.value) return alert('Please select a scenario first');
    await fetch('/api/msme/inject', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: sel.value })
    });
    alert(`Injected: ${sel.options[sel.selectedIndex].text}`);
    const res = await (await fetch('/api/msme/state')).json();
    updateDashboardState(res);
  });

  document.getElementById('btnRunDashCycle')?.addEventListener('click', () => {
    runCycleWith3DTransition();
  });
}

function runCycleWith3DTransition() {
  if (switchViewCallback) switchViewCallback('office');
  const runBtn = document.querySelector('.pp-run');
  if (runBtn) runBtn.click();

  // Return to dashboard after animation
  setTimeout(async () => {
    const res = await (await fetch('/api/msme/state')).json();
    updateDashboardState(res);
    if (switchViewCallback) switchViewCallback('dashboard');
  }, 1800);
}

function renderChat() {
  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Ask Your Finance Team</h2>
        <span class="cd-pill ${llmStatus.mode === 'on' ? 'live' : ''}">
          ${llmStatus.mode === 'on' ? `AI Active (${llmStatus.last_provider})` : 'Rules Mode'}
        </span>
      </div>
      <p style="color:var(--grey);font-size:13px;margin:4px 0 16px 0;">
        Converse directly with the multi-agent finance council. Ask about working capital, cash runway, trade credit decisions, or scenario readiness.
      </p>

      <div class="cd-card" style="margin-bottom:16px;max-height:450px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;" id="chatContainer">
        ${chatHistory.length ? chatHistory.map(msg => `
          <div style="display:flex;flex-direction:column;align-self:${msg.role === 'user' ? 'flex-end' : 'flex-start'};max-width:85%;background:${msg.role === 'user' ? 'var(--ink)' : 'rgba(0,0,0,0.04)'};color:${msg.role === 'user' ? '#fff' : 'inherit'};padding:10px 14px;border-radius:8px;">
            <div style="font-size:11px;opacity:0.75;margin-bottom:3px;display:flex;justify-content:space-between;gap:8px;">
              <span>${msg.role === 'user' ? 'Client' : 'Finance Advisory Council'}</span>
              ${msg.source ? `<span class="source-badge ${msg.source.startsWith('llm') ? 'llm' : 'rules'}">${esc(msg.source)}</span>` : ''}
            </div>
            <div style="font-size:13px;line-height:1.45;white-space:pre-wrap;">${esc(msg.text)}</div>
            ${msg.action ? `
              <div style="margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.2);">
                <button class="cd-btn-sm btn-confirm-chat-action" data-action='${JSON.stringify(msg.action)}' style="background:#28a745;color:#fff;font-weight:600;">
                  ⚡ ${esc(msg.action.label || 'Confirm & Apply Suggested Action')}
                </button>
              </div>
            ` : ''}
          </div>
        `).join('') : `
          <div style="text-align:center;color:var(--grey);padding:30px 0;">
            Ask questions like: <em>"Can we afford a ₹1.5 lakh inventory purchase?"</em> or <em>"What happens if our top customer delays payment?"</em>
          </div>
        `}
      </div>

      <div class="cd-card">
        <div style="display:flex;gap:10px;">
          <input id="inpChatQuestion" placeholder="Ask your finance team..." style="flex:1;padding:8px 12px;font-family:inherit;font-size:13px;border:1px solid var(--hairline);border-radius:4px;" ${isChatBusy ? 'disabled' : ''}>
          <button id="btnSendChatQuestion" class="cd-btn primary" ${isChatBusy ? 'disabled' : ''}>
            ${isChatBusy ? 'Thinking...' : 'SEND'}
          </button>
        </div>
      </div>
    </div>
  `;
}

function attachChatEvents() {
  const inp = document.getElementById('inpChatQuestion');
  const sendBtn = document.getElementById('btnSendChatQuestion');

  const doSend = async () => {
    const q = inp?.value?.trim();
    if (!q || isChatBusy) return;
    chatHistory.push({ role: 'user', text: q });
    isChatBusy = true;
    renderActiveTab();

    try {
      const res = await fetch('/api/msme/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: q })
      });
      const data = await res.json();
      chatHistory.push({
        role: 'assistant',
        text: data.answer || 'No answer returned',
        source: data.source || 'rule-fallback',
        action: data.suggested_action
      });
    } catch (e) {
      chatHistory.push({ role: 'assistant', text: 'Error contacting finance team: ' + e.message, source: 'rule-fallback' });
    } finally {
      isChatBusy = false;
      renderActiveTab();
      const cont = document.getElementById('chatContainer');
      if (cont) cont.scrollTop = cont.scrollHeight;
    }
  };

  sendBtn?.addEventListener('click', doSend);
  inp?.addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });

  document.querySelectorAll('.btn-confirm-chat-action').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const act = JSON.parse(btn.dataset.action);
        if (act.type === 'inject_scenario') {
          await fetch('/api/msme/inject', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'custom', text: act.text })
          });
          alert('Applied scenario: ' + act.text);
          const stateRes = await (await fetch('/api/msme/state')).json();
          updateDashboardState(stateRes);
        }
      } catch (err) {
        alert('Action error: ' + err.message);
      }
    });
  });
}

function renderDigitize() {
  const isBusy = digitizeState.loading;
  const hasData = digitizeState.rows && digitizeState.rows.length > 0;

  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Document Digitizer & Verification (Python Cascade)</h2>
        <span class="cd-pill ${digitizeState.docType === 'INVOICE' ? 'live' : ''}">
          ${digitizeState.docType || 'READY'}
        </span>
      </div>
      <p style="color:var(--grey);font-size:13px;margin:4px 0 16px 0;">
        Upload B2B invoices (TXT, PDF, PNG/JPG) or inventory logs (CSV). The Python backend extracts structured tables,
        applies column header fuzzy matching, normalizes GSTIN/tax fields, and validates receipt arithmetic.
      </p>

      <div class="cd-card" style="margin-bottom:16px;">
        <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--ink);">Quick Test with Sample SME Documents:</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="btnSampleB2B" class="cd-btn" ${isBusy ? 'disabled' : ''}>📄 B2B Invoice (Dell/Fastener PO)</button>
          <button id="btnSampleInv" class="cd-btn" ${isBusy ? 'disabled' : ''}>📊 SME Inventory (Messy CSV)</button>
          <button id="btnSampleBill" class="cd-btn" ${isBusy ? 'disabled' : ''}>🧾 Restaurant Receipt (Scan Text)</button>
        </div>
      </div>

      <div class="cd-card" style="margin-bottom:16px;">
        <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--ink);">Upload Document:</div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <input type="file" id="digFileInput" accept=".txt,.csv,.json,.pdf,.png,.jpg,.jpeg" style="font-family:var(--ui);font-size:12px;">
          <button id="btnParseUploaded" class="cd-btn primary" ${isBusy ? 'disabled' : ''}>
            ${isBusy ? '⏳ Processing via Python...' : '⚡ Run Digitizer / OCR'}
          </button>
        </div>
        ${digitizeState.error ? `<div style="color:#d9534f;font-size:12px;margin-top:8px;">⚠️ ${esc(digitizeState.error)}</div>` : ''}
        ${digitizeState.successMsg ? `<div style="color:#28a745;font-weight:600;font-size:12px;margin-top:8px;">✓ ${esc(digitizeState.successMsg)}</div>` : ''}
      </div>

      ${hasData ? `
        <div class="cd-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div>
              <span style="font-weight:600;font-size:14px;color:var(--ink);">Extracted & Verified Records</span>
              <span style="color:var(--grey);font-size:12px;margin-left:8px;">Source: ${esc(digitizeState.filename)} (${digitizeState.rows.length} rows)</span>
            </div>
            <button id="btnAddDigitizeRow" class="cd-btn" style="font-size:11px;">+ Add Line Item</button>
          </div>

          <div style="overflow-x:auto;">
            <table class="cd-table" id="digReviewTable">
              <thead>
                <tr>
                  ${digitizeState.columns.map(c => `<th>${esc(c.toUpperCase().replace(/_/g, ' '))}</th>`).join('')}
                  <th style="width:40px;"></th>
                </tr>
              </thead>
              <tbody>
                ${digitizeState.rows.map((row, idx) => `
                  <tr data-idx="${idx}">
                    ${digitizeState.columns.map(col => `
                      <td>
                        <input class="dig-cell" data-idx="${idx}" data-col="${col}"
                               value="${esc(row[col] ?? '')}"
                               style="width:100%;background:transparent;border:1px solid transparent;font-family:inherit;font-size:12px;padding:3px;color:inherit;"
                               onfocus="this.style.borderColor='var(--hairline)'" onblur="this.style.borderColor='transparent'">
                      </td>
                    `).join('')}
                    <td><button class="cd-del-btn btn-del-dig" data-idx="${idx}">✕</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:12px;color:var(--grey);">
              Review and edit values above, then commit to persist to SQLite (<code>sme_digitalized_data.db</code>).
            </div>
            <button id="btnCommitDigitized" class="cd-btn primary" style="background:#28a745;color:#fff;font-weight:600;padding:8px 18px;">
              💾 COMMIT TO BOOKS & REFRESH LEDGER
            </button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function attachDigitizeEvents() {
  const parseBtn = document.getElementById('btnParseUploaded');
  const fileInput = document.getElementById('digFileInput');

  document.getElementById('btnSampleB2B')?.addEventListener('click', async () => {
    runParseForSample('data/sample_documents/b2b_purchase_order.txt', 'b2b_purchase_order.txt');
  });
  document.getElementById('btnSampleInv')?.addEventListener('click', async () => {
    runParseForSample('data/sample_documents/messy_sme_inventory.csv', 'messy_sme_inventory.csv');
  });
  document.getElementById('btnSampleBill')?.addEventListener('click', async () => {
    runParseForSample('data/sample_documents/restaurant_bill_sample.txt', 'restaurant_bill_sample.txt');
  });

  parseBtn?.addEventListener('click', () => {
    if (!fileInput?.files?.length) return alert('Please select a file to digitize');
    const file = fileInput.files[0];
    const reader = new FileReader();

    digitizeState.loading = true;
    digitizeState.error = null;
    digitizeState.successMsg = null;
    renderActiveTab();

    if (file.name.match(/\.(txt|csv|json)$/i)) {
      reader.onload = async () => {
        try {
          const res = await fetch('/api/msme/digitize/parse', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ filename: file.name, content: reader.result })
          });
          const data = await res.json();
          handleParseResponse(data, file.name);
        } catch (err) {
          digitizeState.loading = false;
          digitizeState.error = err.message;
          renderActiveTab();
        }
      };
      reader.readAsText(file);
    } else {
      reader.onload = async () => {
        try {
          const base64 = reader.result.split(',')[1];
          const res = await fetch('/api/msme/digitize/parse', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ filename: file.name, contentBase64: base64 })
          });
          const data = await res.json();
          handleParseResponse(data, file.name);
        } catch (err) {
          digitizeState.loading = false;
          digitizeState.error = err.message;
          renderActiveTab();
        }
      };
      reader.readAsDataURL(file);
    }
  });

  document.querySelectorAll('.dig-cell').forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = +e.target.dataset.idx;
      const col = e.target.dataset.col;
      if (digitizeState.rows[idx]) {
        let val = e.target.value;
        if (col.includes('stock') || col.includes('cost') || col.includes('amount') || col.includes('total') || col.includes('subtotal')) {
          const num = parseFloat(val);
          if (!isNaN(num)) val = num;
        }
        digitizeState.rows[idx][col] = val;
      }
    });
  });

  document.querySelectorAll('.btn-del-dig').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = +e.target.dataset.idx;
      digitizeState.rows.splice(idx, 1);
      renderActiveTab();
    });
  });

  document.getElementById('btnAddDigitizeRow')?.addEventListener('click', () => {
    const blank = {};
    digitizeState.columns.forEach(c => blank[c] = '');
    digitizeState.rows.push(blank);
    renderActiveTab();
  });

  document.getElementById('btnCommitDigitized')?.addEventListener('click', async () => {
    if (!digitizeState.rows.length) return alert('No rows to commit');
    try {
      const btn = document.getElementById('btnCommitDigitized');
      if (btn) btn.disabled = true;

      const res = await fetch('/api/msme/digitize/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          doc_type: digitizeState.docType,
          rows: digitizeState.rows
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert('Commit error: ' + (data.error || 'Failed to commit records'));
      } else {
        digitizeState.successMsg = data.message;
        digitizeState.rows = [];
        await fetchLedger();
        const stateRes = await (await fetch('/api/msme/state')).json();
        updateDashboardState(stateRes);
        renderActiveTab();
        alert('✓ ' + data.message);
      }
    } catch (e) {
      alert('Error committing to books: ' + e.message);
    }
  });
}

async function runParseForSample(relPath, sampleName) {
  try {
    digitizeState.loading = true;
    digitizeState.error = null;
    digitizeState.successMsg = null;
    renderActiveTab();

    const sampleRes = await fetch('/' + relPath + '?t=' + Date.now());
    let content = '';
    if (sampleRes.ok) content = await sampleRes.text();
    const res = await fetch('/api/msme/digitize/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: sampleName, content })
    });
    const data = await res.json();
    handleParseResponse(data, sampleName);
  } catch (err) {
    digitizeState.loading = false;
    digitizeState.error = err.message;
    renderActiveTab();
  }
}

function handleParseResponse(data, fallbackName) {
  digitizeState.loading = false;
  if (!data.success) {
    digitizeState.error = data.error || 'Failed to parse document';
    renderActiveTab();
    return;
  }
  digitizeState.docType = data.doc_type || 'INVOICE';
  digitizeState.filename = data.filename || fallbackName;
  digitizeState.columns = data.columns || Object.keys(data.rows?.[0] || {});
  digitizeState.rows = data.rows || [];
  digitizeState.error = null;
  digitizeState.successMsg = `Successfully parsed ${digitizeState.rows.length} records from ${digitizeState.filename}.`;
  renderActiveTab();
}

async function callClientAction(action, params) {
  try {
    const res = await fetch('/api/msme/client-action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, params })
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      alert('Action Failed: ' + (data.error || 'Unknown error'));
    } else {
      await fetchLedger();
      updateDashboardState(data);
      alert('✓ Action successfully recorded in books and synchronized with live ledger!');
    }
  } catch (e) {
    alert('Error executing client action: ' + e.message);
  }
}

async function saveLedgerChanges() {
  try {
    const res = await fetch('/api/msme/ledger/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(currentLedger)
    });
    const data = await res.json();
    if (!res.ok) {
      alert('Validation Error: ' + (data.error || 'Failed to save ledger'));
    } else {
      alert('Ledger successfully saved and synced with live simulation state!');
      updateDashboardState(data);
    }
  } catch (e) {
    alert('Error saving ledger: ' + e.message);
  }
}
