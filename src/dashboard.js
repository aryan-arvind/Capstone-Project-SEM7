// Client Dashboard view: Overview KPIs, Editable AR/AP/Inventory tables,
// Human-in-the-loop Agent Decisions with source badges, and Scenario box.
import { money } from './v1data.js';

let activeTab = 'overview';
let currentSnapshot = null;
let currentLedger = null;
let switchViewCallback = null;

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

  // Fetch initial ledger
  fetchLedger();
}

export function updateDashboardState(snap) {
  currentSnapshot = snap;
  if (!currentLedger && snap) {
    fetchLedger();
  }
  renderActiveTab();
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
  }
}

function renderOverview() {
  const m = currentSnapshot?.metrics || { cash: 0, runway: 0, dso: 0, dpo: 0, ccc: 0 };
  const b = currentSnapshot?.books || { ar: 0, ap: 0, inventory_units: 0, od_used: 0, od_limit: 0, gst_payable: 0 };
  const isLive = currentSnapshot?.mode === 'live';
  const src = isLive ? 'SQLite' : 'Synthetic';

  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Executive Financial Overview</h2>
        <span class="cd-pill ${isLive ? 'live' : ''}">${isLive ? '● REAL OPENING BOOKS' : '○ SYNTHETIC MODEL'}</span>
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
          <div class="kpi-sub">DSO: ${m.dso ? m.dso.toFixed(0) : 0} days</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Payables (AP)</span><span class="kpi-src">${src}</span></div>
          <div class="kpi-val">${inr(b.ap)}</div>
          <div class="kpi-sub">DPO: ${m.dpo ? m.dpo.toFixed(0) : 0} days</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Cash Conversion (CCC)</span><span class="kpi-src">Derived</span></div>
          <div class="kpi-val">${m.ccc ? m.ccc.toFixed(0) : 0} days</div>
          <div class="kpi-sub">DIO: ${m.dio ? m.dio.toFixed(0) : 0} days</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Inventory On Hand</span><span class="kpi-src">${src}</span></div>
          <div class="kpi-val">${b.inventory_units.toLocaleString('en-IN')} units</div>
          <div class="kpi-sub">Capacity: ${currentSnapshot?.constraints?.inventory_capacity_units || 6000} units</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">GST Liability</span><span class="kpi-src">Profile</span></div>
          <div class="kpi-val">${inr(b.gst_payable)}</div>
          <div class="kpi-sub">Mandatory compliance dues</div>
        </div>
      </div>
    </div>
  `;
}

function renderARTable() {
  const arList = currentLedger?.ar || [];
  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Accounts Receivable (Customer Invoices)</h2>
        <button id="btnAddAR" class="cd-btn-primary">+ Add Customer Invoice</button>
      </div>
      <table class="cd-table">
        <thead>
          <tr>
            <th>Invoice ID</th>
            <th>Customer Name</th>
            <th style="text-align:right">Amount (₹)</th>
            <th style="text-align:center">Issued Week</th>
            <th style="text-align:center">Due Week</th>
            <th style="text-align:center">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${arList.length ? arList.map((row, idx) => `
            <tr>
              <td><code>${esc(row.id)}</code></td>
              <td>${esc(row.customer)}</td>
              <td style="text-align:right"><b>${inr(row.amount)}</b></td>
              <td style="text-align:center">Week ${row.issued}</td>
              <td style="text-align:center"><span class="due-tag">Week ${row.due}</span></td>
              <td style="text-align:center"><button class="cd-del-btn" data-type="ar" data-idx="${idx}">Delete</button></td>
            </tr>
          `).join('') : '<tr><td colspan="6" class="cd-empty">No receivables registered.</td></tr>'}
        </tbody>
      </table>
      <div class="cd-save-bar">
        <button id="btnSaveLedger" class="cd-btn-save">Save & Sync to Live Books</button>
      </div>
    </div>
  `;
}

function renderAPTable() {
  const apList = currentLedger?.ap || [];
  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Accounts Payable (Supplier Invoices)</h2>
        <button id="btnAddAP" class="cd-btn-primary">+ Add Supplier Invoice</button>
      </div>
      <table class="cd-table">
        <thead>
          <tr>
            <th>Invoice ID</th>
            <th>Supplier Name</th>
            <th style="text-align:right">Amount (₹)</th>
            <th style="text-align:center">Issued Week</th>
            <th style="text-align:center">Due Week</th>
            <th style="text-align:center">MSME Vendor</th>
            <th style="text-align:center">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${apList.length ? apList.map((row, idx) => `
            <tr>
              <td><code>${esc(row.id)}</code></td>
              <td>${esc(row.supplier)}</td>
              <td style="text-align:right"><b>${inr(row.amount)}</b></td>
              <td style="text-align:center">Week ${row.issued}</td>
              <td style="text-align:center">Week ${row.due}</td>
              <td style="text-align:center"><span class="msme-badge ${row.msme ? 'yes' : 'no'}">${row.msme ? '✓ MSME (45-Day)' : 'Standard'}</span></td>
              <td style="text-align:center"><button class="cd-del-btn" data-type="ap" data-idx="${idx}">Delete</button></td>
            </tr>
          `).join('') : '<tr><td colspan="7" class="cd-empty">No payables registered.</td></tr>'}
        </tbody>
      </table>
      <div class="cd-save-bar">
        <button id="btnSaveLedger" class="cd-btn-save">Save & Sync to Live Books</button>
      </div>
    </div>
  `;
}

function renderInventory() {
  const inv = currentLedger?.inventory || { units: 3530, unit_cost: 320 };
  return `
    <div class="cd-section">
      <div class="cd-head"><h2>Inventory & Warehouse Position</h2></div>
      <div class="cd-kpi-grid" style="margin-bottom:20px">
        <div class="cd-card">
          <div class="kpi-label">Stock Units</div>
          <div class="kpi-val">${inv.units.toLocaleString('en-IN')}</div>
        </div>
        <div class="cd-card">
          <div class="kpi-label">Weighted Unit Cost</div>
          <div class="kpi-val">${inr(inv.unit_cost)}</div>
        </div>
        <div class="cd-card">
          <div class="kpi-label">Valuation on Books</div>
          <div class="kpi-val">${inr(inv.units * inv.unit_cost)}</div>
        </div>
      </div>
      <div class="cd-form-row">
        <label>Update Current Stock Units: <input type="number" id="inpInvUnits" value="${inv.units}"></label>
        <label>Update Unit Cost (₹): <input type="number" id="inpInvCost" value="${inv.unit_cost}"></label>
        <button id="btnSaveInv" class="cd-btn-save" style="margin-top:auto">Apply Inventory</button>
      </div>
    </div>
  `;
}

function renderDecisions() {
  const tasks = currentSnapshot?.tasks || [];
  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Specialist Agent Proposals & Human Arbitration Overrides</h2>
        <span class="cd-sub-note">Review LLM/Rule decisions. Human decisions override agent recommendations.</span>
      </div>
      <div class="cd-decisions-list">
        ${tasks.length ? tasks.map(t => `
          <div class="cd-decision-card ${t.state}">
            <div class="d-top">
              <span class="d-dept ${t.dept}">${esc(t.dept?.toUpperCase())}</span>
              <span class="d-action">${esc(t.label || t.action_type)}</span>
              <span class="d-src-badge ${t.source?.startsWith('llm') ? 'llm' : 'rule'}">${esc(t.source || 'rule-fallback')}</span>
              <span class="sp"></span>
              <span class="d-amt">${inr(t.amount_approved_inr ?? t.amount_inr)}</span>
            </div>
            <div class="d-mid">
              <div class="d-reason">${esc(t.rationale || t.reason || 'Specialist recommendation')}</div>
              <div class="d-meta">Confidence: <b>${Math.round((t.confidence || 0) * 100)}%</b> | Week: ${t.timing_week} | Cash Impact: <b>${inr(t.cash_impact_inr)}</b></div>
            </div>
            <div class="d-bottom">
              <span class="d-status ${t.state}">Status: <b>${esc(t.state?.toUpperCase())}</b></span>
              <span class="sp"></span>
              <div class="d-actions">
                <button class="btn-override-approve" data-id="${t.id}">Approve</button>
                <button class="btn-override-reject" data-id="${t.id}">Reject</button>
              </div>
            </div>
          </div>
        `).join('') : '<div class="cd-empty">No decisions in current cycle. Click "RUN DECISION CYCLE" in Scenarios tab to generate proposals.</div>'}
      </div>
    </div>
  `;
}

function renderScenarios() {
  return `
    <div class="cd-section">
      <div class="cd-head"><h2>Market Stress Testing & Decision Engine</h2></div>
      <div class="cd-card" style="padding:22px; max-width:800px">
        <h3>Inject Market Shock or Custom Scenario</h3>
        <p style="color:var(--grey); font-size:12px; margin: 8px 0 16px;">
          Simulate supply chain bottlenecks, demand surges, or delayed payments. The Arbiter verifies whether cash buffers hold.
        </p>
        <div style="display:flex; gap:12px; margin-bottom:14px;">
          <select id="selPresetScenario" style="padding:9px; border-radius:8px; border:1px solid var(--hairline); flex:1">
            <option value="">Select Pre-configured Scenario...</option>
            <option value="delayed_receivable">Delayed Receivable (4-week delay on largest customer)</option>
            <option value="supplier_price_spike">Supplier Price Spike (+40% unit raw material cost)</option>
            <option value="demand_surge">Demand Surge (+80% sales order intake)</option>
            <option value="credit_limit_tightened">Credit Limit Tightened (Bank cuts OD by 50%)</option>
          </select>
          <button id="btnInjectPreset" class="cd-btn-primary">Inject Preset</button>
        </div>
        <div style="margin-top:20px;">
          <label style="font-size:11px; font-weight:700; color:var(--grey); text-transform:uppercase">Custom Free-Text Scenario</label>
          <textarea id="txtCustomScenario" style="width:100%; height:70px; margin-top:6px; padding:8px; border:1px solid var(--hairline); border-radius:8px; font-family:var(--ui)" placeholder="e.g. Major automotive client delayed payment of ₹1.4L by 3 weeks due to inventory audit..."></textarea>
        </div>
        <div style="display:flex; gap:12px; margin-top:20px; align-items:center">
          <button id="btnRunDashCycle" class="cd-btn-run">RUN DECISION CYCLE (3D ANIMATED)</button>
          <span style="font-size:12px; color:var(--grey)">Triggers 6 specialist LLM/Rule agents and updates books.</span>
        </div>
      </div>
    </div>
  `;
}

function attachAREvents() {
  document.getElementById('btnAddAR')?.addEventListener('click', () => {
    const cust = prompt('Enter Customer Name:', 'New OEM Sub-tier');
    if (!cust) return;
    const amt = parseInt(prompt('Enter Invoice Amount (₹):', '50000'), 10);
    if (!amt || amt <= 0) return alert('Invalid amount');
    currentLedger.ar.push({
      id: `AR_${Date.now().toString(36).toUpperCase()}`,
      customer: cust,
      amount: amt,
      issued: 0,
      due: 4
    });
    renderActiveTab();
  });

  document.querySelectorAll('.cd-del-btn[data-type="ar"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      currentLedger.ar.splice(idx, 1);
      renderActiveTab();
    });
  });

  document.getElementById('btnSaveLedger')?.addEventListener('click', saveLedgerChanges);
}

function attachAPEvents() {
  document.getElementById('btnAddAP')?.addEventListener('click', () => {
    const supp = prompt('Enter Supplier Name:', 'Vendor Steel Ltd');
    if (!supp) return;
    const amt = parseInt(prompt('Enter Invoice Amount (₹):', '25000'), 10);
    if (!amt || amt <= 0) return alert('Invalid amount');
    const isMsme = confirm('Is this an MSME vendor? (Subject to 45-day statutory payment rule)');
    currentLedger.ap.push({
      id: `AP_${Date.now().toString(36).toUpperCase()}`,
      supplier: supp,
      amount: amt,
      issued: 0,
      due: 6,
      msme: isMsme
    });
    renderActiveTab();
  });

  document.querySelectorAll('.cd-del-btn[data-type="ap"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      currentLedger.ap.splice(idx, 1);
      renderActiveTab();
    });
  });

  document.getElementById('btnSaveLedger')?.addEventListener('click', saveLedgerChanges);
}

function attachInvEvents() {
  document.getElementById('btnSaveInv')?.addEventListener('click', () => {
    const u = parseInt(document.getElementById('inpInvUnits').value, 10);
    const c = parseInt(document.getElementById('inpInvCost').value, 10);
    if (isNaN(u) || u < 0 || isNaN(c) || c < 0) return alert('Please enter valid non-negative numbers');
    currentLedger.inventory = { units: u, unit_cost: c };
    saveLedgerChanges();
  });
}

function attachDecisionEvents() {
  document.querySelectorAll('.btn-override-approve').forEach(b => {
    b.addEventListener('click', async () => {
      const id = b.dataset.id;
      await fetch('/api/msme/decision/override', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, outcome: 'approved' })
      });
      const res = await (await fetch('/api/msme/state')).json();
      updateDashboardState(res);
    });
  });

  document.querySelectorAll('.btn-override-reject').forEach(b => {
    b.addEventListener('click', async () => {
      const id = b.dataset.id;
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

function attachScenarioEvents() {
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

  document.getElementById('btnRunDashCycle')?.addEventListener('click', async () => {
    if (switchViewCallback) switchViewCallback('office');
    const runBtn = document.querySelector('.pp-run');
    if (runBtn) runBtn.click();
  });
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
